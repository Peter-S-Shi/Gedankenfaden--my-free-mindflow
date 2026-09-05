/**
 * Gedankenfaden Milestone 7-A: Native RC Smoke Verification
 * Empirically tests the built Windows binary, file association CLI argument handling,
 * portable package integrity, and AppData runtime initialization.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as fflate from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
let smokeProcess = null;
let smokeMflowPath = null;
let isolatedAppDataDir = null;

function cleanupSmokeState() {
  if (smokeProcess) {
    const lingeringProcess = smokeProcess;
    console.error(`[WARN] Native PID ${lingeringProcess.pid} is still running; refusing forced termination or live-profile deletion.`);
    smokeProcess = null;
    lingeringProcess.once('exit', () => cleanupSmokeState());
    return;
  }
  if (smokeMflowPath && fs.existsSync(smokeMflowPath)) {
    fs.unlinkSync(smokeMflowPath);
  }
  if (isolatedAppDataDir && fs.existsSync(isolatedAppDataDir)) {
    fs.rmSync(isolatedAppDataDir, { recursive: true, force: true });
  }
}

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
  smokeMflowPath = path.resolve(rootDir, 'test_association_smoke.mflow');
  isolatedAppDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedankenfaden-smoke-'));
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
  const cdpPort = 19222;
  console.log(`[INFO] 3. Launching gedankenfaden.exe with argument: "${smokeMflowPath}"...`);
  console.log(`       Enabling WebView2 remote debugging on port ${cdpPort}...`);

  const child = spawn(exePath, [smokeMflowPath], {
    detached: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      GEDANKENFADEN_TEST_APP_DATA_DIR: isolatedAppDataDir,
    },
  });
  smokeProcess = child;

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

          if (!domEvidence) {
            clearTimeout(failTimeout);
            try { ws.close(); } catch {}
            reject(new Error('CanvasEditor or sentinel node was not rendered in the live WebView2 DOM'));
          } else {
            // Step 3b: Focused Empirical Native Retest: Selection UX Persistence
            console.log('       Running empirical native Selection UX persistence check...');
            const selectionUxResponse = await sendCdp('Runtime.evaluate', {
              expression: `(async function() {
                // Ensure Inspector is open
                let inspector = document.querySelector('aside[aria-label="Inspector Panel"]');
                if (!inspector) {
                  const toggleBtn = document.querySelector('button[title*="Inspector"]');
                  if (toggleBtn) toggleBtn.click();
                  await new Promise(r => setTimeout(r, 100));
                  inspector = document.querySelector('aside[aria-label="Inspector Panel"]');
                }

                // 1. Click node n2 to select it
                const node2 = document.querySelector('[data-testid="custom-node-n2"]') || document.querySelectorAll('.react-flow__node')[1];
                if (!node2) return { success: false, reason: 'Target node n2 not found' };
                node2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                await new Promise(r => setTimeout(r, 150));

                const nodeParent = node2.closest('.react-flow__node');
                const isSelectedInitial = nodeParent ? nodeParent.classList.contains('selected') : false;
                const inspectorShowsNodeInitial = inspector ? inspector.innerText.includes('Node Style') : false;

                if (!isSelectedInitial || !inspectorShowsNodeInitial) {
                  return { success: false, reason: 'Initial selection failed', isSelectedInitial, inspectorShowsNodeInitial };
                }

                // 2. Modify Attribute 1: Click "Pill" shape button in Inspector
                const buttons = Array.from(inspector.querySelectorAll('button'));
                const pillButton = buttons.find(b => b.innerText.trim() === 'Pill');
                if (!pillButton) return { success: false, reason: 'Pill shape button not found in Inspector' };
                pillButton.click();
                await new Promise(r => setTimeout(r, 150));

                const isSelectedAfterAttr1 = nodeParent ? nodeParent.classList.contains('selected') : false;
                const inspectorShowsNodeAfterAttr1 = inspector.innerText.includes('Node Style');
                if (!isSelectedAfterAttr1 || !inspectorShowsNodeAfterAttr1) {
                  return { success: false, reason: 'Selection lost after Attribute 1 (shape change)', isSelectedAfterAttr1, inspectorShowsNodeAfterAttr1 };
                }

                // 3. Modify Attribute 2: Click a Fill Color preset button in Inspector
                const colorButtons = inspector.querySelectorAll('div.flex.flex-wrap.gap-1 button');
                if (colorButtons.length < 5) return { success: false, reason: 'Color preset buttons not found' };
                colorButtons[4].click();
                await new Promise(r => setTimeout(r, 150));

                const isSelectedAfterAttr2 = nodeParent ? nodeParent.classList.contains('selected') : false;
                const inspectorShowsNodeAfterAttr2 = inspector.innerText.includes('Node Style');
                if (!isSelectedAfterAttr2 || !inspectorShowsNodeAfterAttr2) {
                  return { success: false, reason: 'Selection lost after Attribute 2 (color change)', isSelectedAfterAttr2, inspectorShowsNodeAfterAttr2 };
                }

                // 4. Click canvas blank pane to clear selection
                const pane = document.querySelector('.react-flow__pane');
                if (!pane) return { success: false, reason: 'React Flow pane not found' };
                pane.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                await new Promise(r => setTimeout(r, 150));

                const anySelectedAfterPaneClick = document.querySelectorAll('.react-flow__node.selected').length > 0;
                const inspectorShowsNodeAfterDeselect = inspector.innerText.includes('Node Style');

                if (anySelectedAfterPaneClick || inspectorShowsNodeAfterDeselect) {
                  return { success: false, reason: 'Deselection failed on pane click', anySelectedAfterPaneClick, inspectorShowsNodeAfterDeselect };
                }

                return {
                  success: true,
                  isSelectedInitial,
                  isSelectedAfterAttr1,
                  isSelectedAfterAttr2,
                  deselectedOnPaneClick: !anySelectedAfterPaneClick,
                };
              })()`,
              awaitPromise: true,
              returnByValue: true,
            });

            const selectionUxResult = selectionUxResponse?.result?.value;
            if (!selectionUxResult || !selectionUxResult.success) {
              throw new Error(`Focused Selection UX smoke test failed: ${JSON.stringify(selectionUxResult)}`);
            }
            domEvidence.selectionUxVerified = selectionUxResult;

            const closeResponse = await sendCdp('Runtime.evaluate', {
              expression: `(() => {
                setTimeout(() => {
                  window.__TAURI_INTERNALS__.invoke('close_app_window')
                    .catch(() => {
                      window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' })
                        .catch((error) => console.error('Graceful close failed', error));
                    });
                }, 250);
                return 'close-scheduled';
              })()`,
              returnByValue: true,
            });
            if (closeResponse?.result?.value !== 'close-scheduled') {
              throw new Error('Tauri window close command was not scheduled');
            }
            clearTimeout(failTimeout);
            try { ws.close(); } catch {}
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
    throw err;
  }

  console.log(`[PASS] 3. Real Windows WebView2 Runtime UI Verification Passed:`);
  console.log(`       CanvasEditor Mounted: ${domProof.canvasEditorMounted}`);
  console.log(`       Active Document Title: "${domProof.activeDocumentTitle}"`);
  console.log(`       Sentinel Node Rendered: ${domProof.sentinelTextRendered}`);
  console.log(`       Rendered Node Count on Canvas: ${domProof.renderedNodeCount}`);
  console.log(`       Live DOM Content Preview: "${domProof.bodyPreview}"\n`);

  const gracefulExit = await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve({ code: child.exitCode, signal: child.signalCode });
    const timeout = setTimeout(() => resolve(null), 10000);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
  if (!gracefulExit || gracefulExit.code !== 0 || gracefulExit.signal) {
    throw new Error(`Native app did not exit gracefully: ${JSON.stringify(gracefulExit)}`);
  }
  smokeProcess = null;
  console.log(`       Native process PID ${child.pid} closed through Tauri with exit code 0.\n`);

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

  cleanupSmokeState();
  if (fs.existsSync(isolatedAppDataDir || '')) {
    throw new Error('Isolated smoke AppData was not removed');
  }
  console.log('[PASS] 5. Smoke recovery/AppData state isolated and removed.');

  console.log('\n======================================================================');
  console.log('ALL LOCAL NATIVE RC SMOKE TESTS PASSED (GATE H: VERIFIED)');
  console.log('======================================================================\n');
}

runSmokeTest().catch((err) => {
  cleanupSmokeState();
  console.error('\n[FAIL] Smoke verification failed:', err);
  process.exit(1);
});
