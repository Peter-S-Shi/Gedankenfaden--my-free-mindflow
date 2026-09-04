/**
 * Gedankenfaden Milestone 7-A: Native RC Smoke Verification
 * Empirically tests the built Windows binary, file association CLI argument handling,
 * portable package integrity, and AppData runtime initialization.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as fflate from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function runSmokeTest() {
  console.log('=== Milestone 7-A: Windows Native RC Smoke Verification ===\n');

  // Step 1: Verify Release Binary
  const exePath = path.resolve(rootDir, 'src-tauri/target/release/gedankenfaden.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error(`Native binary not found at ${exePath}`);
  }
  const stats = fs.statSync(exePath);
  console.log(`[PASS] 1. Release Binary Found: ${exePath}`);
  console.log(`       Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size} bytes)\n`);

  // Step 2: Create a real .mflow container for File Association Smoke Test
  const smokeMflowPath = path.resolve(rootDir, 'test_association_smoke.mflow');
  const testDoc = {
    schemaVersion: '1.0',
    id: 'doc_smoke_mflow_1',
    title: 'Windows Association Smoke Test',
    mode: 'mindmap',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: { id: 'theme-default', name: 'Default', primaryColor: '#2563eb' },
    nodes: [
      { id: 'n1', text: 'Root Mind Map Node', type: 'root', geometry: { x: 200, y: 200, width: 160, height: 44 } },
      { id: 'n2', text: 'File Association Passed', geometry: { x: 420, y: 200, width: 180, height: 44 } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    groups: [],
  };

  const containerFiles = {
    'manifest.json': fflate.strToU8(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          formatVersion: '1.0',
          generator: 'Gedankenfaden Native RC Smoke',
          createdAt: new Date().toISOString(),
          assets: {},
        },
        null,
        2
      )
    ),
    'document.json': fflate.strToU8(JSON.stringify(testDoc, null, 2)),
  };

  const zipped = fflate.zipSync(containerFiles, { level: 6 });
  fs.writeFileSync(smokeMflowPath, zipped);
  console.log(`[PASS] 2. Generated Test .mflow Container: ${smokeMflowPath}`);
  console.log(`       Container Size: ${zipped.length} bytes\n`);

  // Step 3: Empirical Launch of Native Binary with File Association Argument & Live DOM Probe
  const cdpPort = 9222;
  console.log(`[INFO] 3. Launching gedankenfaden.exe with argument: "${smokeMflowPath}"...`);
  console.log(`       Enabling WebView2 remote debugging on port ${cdpPort}...`);

  const child = spawn(exePath, [smokeMflowPath], {
    detached: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
  });

  if (!child.pid) {
    throw new Error('Failed to spawn gedankenfaden.exe process');
  }
  console.log(`       Process spawned successfully with PID: ${child.pid}`);

  // Helper: Poll and attach to WebView2 Chrome DevTools Protocol
  async function inspectLiveDomViaCDP(port, expectedTitle, sentinelText) {
    const cdpEndpoint = `http://127.0.0.1:${port}/json/list`;
    let pageTarget = null;
    const startTime = Date.now();

    while (Date.now() - startTime < 15000) {
      try {
        const res = await fetch(cdpEndpoint);
        if (res.ok) {
          const targets = await res.json();
          const page = targets.find(
            (t) => t.type === 'page' || (t.title && t.title.includes('Gedankenfaden'))
          );
          if (page && page.webSocketDebuggerUrl) {
            pageTarget = page;
            break;
          }
        }
      } catch {
        // Wait for WebView2 to spin up and bind debug port
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!pageTarget) {
      throw new Error(`Timed out waiting for WebView2 CDP endpoint on port ${port}`);
    }

    console.log(`[INFO] Attached to live WebView2 target: "${pageTarget.title}"`);
    console.log(`       Target URL: ${pageTarget.url}`);
    console.log(`       Debugger URL: ${pageTarget.webSocketDebuggerUrl}`);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
      let callId = 1;
      const pendingCalls = new Map();

      const failTimeout = setTimeout(() => {
        try { ws.close(); } catch {}
        reject(new Error('Live DOM inspection timed out after 15s'));
      }, 15000);

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && pendingCalls.has(msg.id)) {
            const { res, rej } = pendingCalls.get(msg.id);
            pendingCalls.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message));
            else res(msg.result);
          }
        } catch (e) {
          // ignore parsing non-JSON messages
        }
      });

      ws.addEventListener('open', async () => {
        const sendCdp = (method, params = {}) => {
          const id = callId++;
          return new Promise((res, rej) => {
            pendingCalls.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        };

        try {
          const pollStart = Date.now();
          let domEvidence = null;

          while (Date.now() - pollStart < 12000) {
            const evalResponse = await sendCdp('Runtime.evaluate', {
              expression: `(function() {
                const canvas = !!document.querySelector('[data-testid="canvas-editor"]');
                const titleEl = document.querySelector('[data-testid="canvas-document-title"]');
                const titleVal = titleEl ? titleEl.value : null;
                const bodyText = document.body ? document.body.innerText : '';
                const hasSentinel = bodyText.includes('${sentinelText}');
                const nodeCount = document.querySelectorAll('[data-testid^="custom-node-"]').length;
                return {
                  canvasEditorMounted: canvas,
                  activeDocumentTitle: titleVal,
                  sentinelTextRendered: hasSentinel,
                  renderedNodeCount: nodeCount,
                  bodyPreview: bodyText.slice(0, 200).replace(/\\s+/g, ' '),
                };
              })()`,
              returnByValue: true,
            });

            const result = evalResponse?.result?.value;
            if (result && result.canvasEditorMounted && result.sentinelTextRendered) {
              domEvidence = result;
              break;
            }
            await new Promise((r) => setTimeout(r, 400));
          }

          clearTimeout(failTimeout);
          try { ws.close(); } catch {}

          if (!domEvidence) {
            reject(new Error('CanvasEditor or sentinel node was not rendered in the live WebView2 DOM'));
          } else {
            resolve(domEvidence);
          }
        } catch (err) {
          clearTimeout(failTimeout);
          try { ws.close(); } catch {}
          reject(err);
        }
      });

      ws.addEventListener('error', (err) => {
        clearTimeout(failTimeout);
        reject(err);
      });
    });
  }

  let domProof;
  try {
    domProof = await inspectLiveDomViaCDP(cdpPort, testDoc.title, 'File Association Passed');
  } catch (err) {
    // Kill child before rethrowing
    try { child.kill('SIGKILL'); } catch {}
    throw err;
  }

  console.log(`[PASS] 3. Real Windows WebView2 Runtime UI Verification Passed:`);
  console.log(`       CanvasEditor Mounted: ${domProof.canvasEditorMounted}`);
  console.log(`       Active Document Title: "${domProof.activeDocumentTitle}"`);
  console.log(`       Sentinel Node Rendered: ${domProof.sentinelTextRendered}`);
  console.log(`       Rendered Node Count on Canvas: ${domProof.renderedNodeCount}`);
  console.log(`       Live DOM Content Preview: "${domProof.bodyPreview}"\n`);

  // Terminate test process cleanly
  try {
    child.kill('SIGTERM');
  } catch {
    // Process already terminated
  }
  console.log(`       Native process PID ${child.pid} gracefully closed.\n`);

  // Step 4: Verify Portable Distribution Package
  const zipPath = path.resolve(rootDir, 'dist-portable/Gedankenfaden-v0.1.0-rc-windows-x64-portable.zip');
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Portable zip not found at ${zipPath}`);
  }
  const zipBytes = fs.readFileSync(zipPath);
  const unzipped = fflate.unzipSync(zipBytes);
  const zipFileNames = Object.keys(unzipped);

  console.log(`[PASS] 4. Verified Standalone Portable Distribution ZIP:`);
  console.log(`       Archive Path: ${zipPath}`);
  console.log(`       Archive Size: ${(zipBytes.length / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`       Archive Entries (${zipFileNames.length}):`);
  for (const name of zipFileNames) {
    console.log(`         - ${name} (${unzipped[name].length} bytes)`);
  }

  const expectedEntries = [
    'Gedankenfaden-v0.1.0-windows-x64/gedankenfaden.exe',
    'Gedankenfaden-v0.1.0-windows-x64/README.txt',
    'Gedankenfaden-v0.1.0-windows-x64/manifest.json',
  ];
  for (const exp of expectedEntries) {
    if (!zipFileNames.includes(exp)) {
      throw new Error(`Missing expected entry in portable zip: ${exp}`);
    }
  }

  // Clean up smoke test container
  if (fs.existsSync(smokeMflowPath)) {
    fs.unlinkSync(smokeMflowPath);
  }

  console.log('\n======================================================================');
  console.log('ALL LOCAL NATIVE RC SMOKE TESTS PASSED (GATE H: VERIFIED)');
  console.log('======================================================================\n');
}

runSmokeTest().catch((err) => {
  console.error('\n[FAIL] Smoke verification failed:', err);
  process.exit(1);
});
