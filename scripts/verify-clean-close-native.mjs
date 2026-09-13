/**
 * Gedankenfaden Ledger F10 / Ticket #14: Native Close vs. Crash Recovery Lifecycle Verification
 *
 * Empirically proves, against the real built Windows binary and WebView2 runtime:
 *   1. A normal native window close (via the same `plugin:window|close` path the OS
 *      close button drives) is recorded as a clean shutdown, so relaunching does NOT
 *      show the crash-recovery banner.
 *   2. An abrupt process kill (simulating a crash / power loss) leaves the session
 *      journal dirty, so relaunching DOES show the crash-recovery banner.
 *
 * This is a manual/local empirical gate (like scripts/verify-smoke-native.mjs's Gate H)
 * and is not part of the automated CI pipeline: it requires the built release binary
 * and a live Windows WebView2 runtime. Run it after `npm run build && npx tauri build`.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const exePath = path.resolve(rootDir, 'src-tauri/target/release/gedankenfaden.exe');

let isolatedAppDataDir = null;
let liveProcess = null;

function cleanup() {
  if (liveProcess && liveProcess.exitCode === null) {
    try {
      liveProcess.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
  liveProcess = null;
  if (isolatedAppDataDir && fs.existsSync(isolatedAppDataDir)) {
    fs.rmSync(isolatedAppDataDir, { recursive: true, force: true });
  }
}

async function waitForCdpTarget(port, timeoutMs = 15000) {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {
      // WebView2 not bound yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for WebView2 CDP endpoint on port ${port}`);
}

function evalOnPage(wsUrl, expression, { awaitPromise = false } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error('CDP evaluate timed out'));
    }, 15000);

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise },
        })
      );
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 1) {
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {
          // ignore
        }
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result?.result?.value);
      }
    });

    ws.addEventListener('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function pollUntil(fn, predicate, timeoutMs = 12000, intervalMs = 400) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

function launch(cdpPort) {
  const child = spawn(exePath, [], {
    detached: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      GEDANKENFADEN_TEST_APP_DATA_DIR: isolatedAppDataDir,
    },
  });
  if (!child.pid) {
    throw new Error('Failed to spawn gedankenfaden.exe process');
  }
  return child;
}

async function startSessionAndReachCanvas(wsUrl) {
  // From the empty Library, create a new mind map — this calls markSessionActive(),
  // writing isCleanShutdown: false into the session journal, exactly like a real user
  // starting to work.
  await pollUntil(
    () =>
      evalOnPage(
        wsUrl,
        `(() => !!document.querySelector('[data-testid="empty-state-new-mindmap"]') ||
                 !!document.querySelector('[data-testid="library-card-grid"]'))()`
      ),
    (ready) => ready === true
  );

  await evalOnPage(
    wsUrl,
    `(() => {
      const btn = document.querySelector('[data-testid="empty-state-new-mindmap"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()`
  );

  const canvasMounted = await pollUntil(
    () => evalOnPage(wsUrl, `(() => !!document.querySelector('[data-testid="canvas-editor"]'))()`),
    (mounted) => mounted === true
  );

  if (!canvasMounted) {
    throw new Error('CanvasEditor did not mount after creating a new document');
  }
}

async function checkForRecoveryBanner(wsUrl) {
  return pollUntil(
    () =>
      evalOnPage(
        wsUrl,
        `(() => {
          const banner = document.querySelector('[data-testid="crash-recovery-banner"]');
          const libraryReady = !!document.querySelector('[data-testid="library-card-grid"]') ||
                                !!document.querySelector('[data-testid="library-empty-state"]');
          return { libraryReady, bannerPresent: !!banner };
        })()`
      ),
    (result) => result && result.libraryReady,
    10000
  );
}

async function waitForExit(child, timeoutMs = 10000) {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function run() {
  console.log('=== Ledger F10 / Ticket #14: Native Close vs. Crash Recovery Verification ===\n');

  if (!fs.existsSync(exePath)) {
    throw new Error(`Native binary not found at ${exePath}. Run "npx tauri build --no-bundle" first.`);
  }

  isolatedAppDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedankenfaden-close-guard-'));

  // --- Phase A: normal close must NOT trigger recovery on relaunch ---
  console.log('[INFO] Phase A: launching, starting a session, then closing normally...');
  const cdpPortA1 = 19322;
  liveProcess = launch(cdpPortA1);
  const targetA1 = await waitForCdpTarget(cdpPortA1);
  await startSessionAndReachCanvas(targetA1.webSocketDebuggerUrl);
  console.log('[INFO] Session active; requesting a normal window close (plugin:window|close)...');

  await evalOnPage(
    targetA1.webSocketDebuggerUrl,
    `window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }).catch(() => {})`
  );

  const exitedCleanly = await waitForExit(liveProcess);
  if (!exitedCleanly) {
    throw new Error('Process did not exit after a normal close request');
  }
  liveProcess = null;
  console.log('[PASS] Phase A.1: process exited after a normal close request.\n');

  console.log('[INFO] Phase A: relaunching with the same profile to check for a false recovery banner...');
  const cdpPortA2 = 19323;
  liveProcess = launch(cdpPortA2);
  const targetA2 = await waitForCdpTarget(cdpPortA2);
  const resultA = await checkForRecoveryBanner(targetA2.webSocketDebuggerUrl);
  if (!resultA || !resultA.libraryReady) {
    throw new Error('Library did not become ready on relaunch after a normal close');
  }
  if (resultA.bannerPresent) {
    throw new Error('FALSE RECOVERY PROMPT: banner shown after a normal, clean window close');
  }
  console.log('[PASS] Phase A.2: no crash-recovery banner after a normal close + relaunch.\n');

  liveProcess.kill('SIGKILL');
  await waitForExit(liveProcess, 5000);
  liveProcess = null;

  // --- Phase B: an abrupt kill must still preserve the recovery prompt ---
  console.log('[INFO] Phase B: launching, starting a session, then killing the process abruptly...');
  const cdpPortB1 = 19324;
  liveProcess = launch(cdpPortB1);
  const targetB1 = await waitForCdpTarget(cdpPortB1);
  await startSessionAndReachCanvas(targetB1.webSocketDebuggerUrl);

  liveProcess.kill('SIGKILL');
  await waitForExit(liveProcess, 5000);
  liveProcess = null;
  console.log('[PASS] Phase B.1: process forcibly terminated (simulated crash).\n');

  console.log('[INFO] Phase B: relaunching with the same profile to confirm recovery is preserved...');
  const cdpPortB2 = 19325;
  liveProcess = launch(cdpPortB2);
  const targetB2 = await waitForCdpTarget(cdpPortB2);
  const resultB = await checkForRecoveryBanner(targetB2.webSocketDebuggerUrl);
  if (!resultB || !resultB.libraryReady) {
    throw new Error('Library did not become ready on relaunch after a forced kill');
  }
  if (!resultB.bannerPresent) {
    throw new Error('MISSING RECOVERY PROMPT: banner absent after an abrupt process kill');
  }
  console.log('[PASS] Phase B.2: crash-recovery banner shown after an abrupt kill + relaunch.\n');

  cleanup();

  console.log('======================================================================');
  console.log('NATIVE CLOSE VS. CRASH RECOVERY LIFECYCLE VERIFICATION PASSED');
  console.log('======================================================================\n');
}

run().catch((err) => {
  cleanup();
  console.error('\n[FAIL] Native close/recovery verification failed:', err);
  process.exit(1);
});
