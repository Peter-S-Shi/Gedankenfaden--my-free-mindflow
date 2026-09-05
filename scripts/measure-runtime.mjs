import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

function startStaticServer(port = 4173) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(distDir, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      const indexPath = path.join(distDir, 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(indexPath));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((c) => fs.existsSync(c));
}

// Generate realistic balanced mindmap documents of specified node count
function generateRepresentativeDocument(nodeCount, mode = 'mindmap') {
  const nodes = [
    {
      id: 'root',
      text: 'Production Root Topic',
      type: 'root',
      geometry: { x: 0, y: 0, width: 160, height: 48 },
    },
  ];
  const edges = [];

  let currentId = 1;
  let parents = ['root'];

  while (currentId < nodeCount) {
    const nextParents = [];
    for (const parentId of parents) {
      if (currentId >= nodeCount) break;
      const branchCount = Math.min(3, nodeCount - currentId);
      for (let b = 0; b < branchCount; b++) {
        const childId = `node_${currentId++}`;
        nodes.push({
          id: childId,
          parentId,
          text: `Representative Node ${childId}`,
          type: 'default',
          geometry: { x: (currentId % 20) * 180, y: Math.floor(currentId / 20) * 80, width: 140, height: 44 },
        });
        edges.push({
          id: `edge_${parentId}_${childId}`,
          source: parentId,
          target: childId,
        });
        nextParents.push(childId);
      }
    }
    parents = nextParents.length > 0 ? nextParents : ['root'];
  }

  return {
    schemaVersion: '1.0',
    id: `doc_stress_${nodeCount}_${mode}`,
    title: `Representative ${nodeCount} ${mode}`,
    mode,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
    groups: [],
  };
}

async function runBenchmark() {
  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('No Chrome/Edge executable found on this system');
  }

  const server = await startStaticServer(4174);
  console.log('[HARNESS] Static server running on http://127.0.0.1:4174');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      '--window-size=1440,900',
    ],
  });

  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();
  await cdp.send('Performance.enable');

  const safeClick = async (selector) => {
    await page.waitForFunction((sel) => Boolean(document.querySelector(sel)), {}, selector);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.click();
      else throw new Error(`Element ${sel} not found`);
    }, selector);
  };

  try {
    // 1. Prepare documents
    const doc100 = generateRepresentativeDocument(100, 'mindmap');
    const doc500 = generateRepresentativeDocument(500, 'mindmap');
    const doc1000 = generateRepresentativeDocument(1000, 'mindmap');

    console.log('\n======================================================');
    console.log(' M6 RUNTIME INTERACTION PERFORMANCE VERIFICATION');
    console.log('======================================================\n');

    // Load documents into localStorage
    await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle0' });
    await page.evaluate((docs) => {
      localStorage.setItem('gedankenfaden_recent_docs_v1', JSON.stringify(docs));
    }, [doc100, doc500, doc1000]);

    await page.reload({ waitUntil: 'networkidle0' });

    // --- TEST 1: Initial Render & Projection (100, 500, 1000 nodes) ---
    const testDocScales = [
      { doc: doc100, count: 100, name: '100 nodes (Medium)' },
      { doc: doc500, count: 500, name: '500 nodes (Large)' },
      { doc: doc1000, count: 1000, name: '1000 nodes (Extreme)' },
    ];

    const renderResults = [];

    for (const testCase of testDocScales) {
      // Ensure we are at Library
      await page.waitForFunction(
        (id) => Boolean(document.querySelector(`[data-testid="doc-card-${id}"]`)),
        {},
        testCase.doc.id
      );

      const t0 = performance.now();
      // Click document card to open in CanvasEditor
      await safeClick(`[data-testid="doc-card-${testCase.doc.id}"]`);

      // Wait until ReactFlow nodes render in DOM
      await page.waitForFunction(
        () => document.querySelectorAll('.react-flow__node').length > 0,
        { timeout: 10000 }
      );
      const renderDuration = performance.now() - t0;
      renderResults.push({ name: testCase.name, count: testCase.count, duration: renderDuration });
      console.log(`[RENDER] ${testCase.name}: ${renderDuration.toFixed(2)} ms`);

      await safeClick('[data-testid="back-to-library-btn"]');
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="library-card-grid"]')));
    }

    // --- TEST 2: Node Selection & Breathing Animation in Real DOM ---
    console.log('\n[INTERACTION] Testing node selection and class wiring...');
    await safeClick(`[data-testid="doc-card-${doc500.id}"]`);
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length > 0);

    const tSelect0 = performance.now();
    await safeClick('.react-flow__node');
    await page.waitForFunction(() => {
      const selected = document.querySelector('.react-flow__node.selected');
      return selected !== null && selected.innerHTML.includes('signature-select-breathe');
    });
    const selectDuration = performance.now() - tSelect0;
    console.log(`[SELECTION] Node select & signature-select-breathe attachment: ${selectDuration.toFixed(2)} ms`);

    // --- TEST 3: Pan & Zoom Viewport Transformation ---
    console.log('\n[INTERACTION] Testing pan & zoom viewport transformation...');
    const paneSelector = '.react-flow__pane';
    await page.waitForFunction((sel) => Boolean(document.querySelector(sel)), {}, paneSelector);

    const tPan0 = performance.now();
    const paneBox = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, paneSelector);

    if (paneBox) {
      await page.mouse.move(paneBox.x + 200, paneBox.y + 200);
      await page.mouse.down();
      await page.mouse.move(paneBox.x + 350, paneBox.y + 350, { steps: 5 });
      await page.mouse.up();
    }
    const panDuration = performance.now() - tPan0;
    console.log(`[PAN/ZOOM] Canvas drag translation latency: ${panDuration.toFixed(2)} ms`);

    // --- TEST 4: Production Toolbar Re-Layout Switch Interaction ---
    console.log('\n[INTERACTION] Testing toolbar re-layout preset switch (Balanced -> LR)...');
    const tRelayout0 = performance.now();
    const relayoutTriggered = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const lrBtn = btns.find((b) => b.textContent && b.textContent.trim() === 'LR');
      if (lrBtn) {
        lrBtn.click();
        return true;
      }
      return false;
    });

    let relayoutDuration = 0;
    if (relayoutTriggered) {
      // Wait for layout update to settle
      await page.waitForFunction(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const activeBtn = btns.find((b) => b.textContent && b.textContent.trim() === 'LR');
        return activeBtn && activeBtn.className.includes('text-blue-700');
      }, { timeout: 5000 });
      relayoutDuration = performance.now() - tRelayout0;
      console.log(`[RE-LAYOUT] Production toolbar LR re-layout latency: ${relayoutDuration.toFixed(2)} ms`);
    } else {
      console.log('[RE-LAYOUT] Toolbar layout preset button not found, skipped');
    }

    // Return to Library for memory observation
    await safeClick('[data-testid="back-to-library-btn"]');
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="library-card-grid"]')));

    console.log('\n======================================================');
    console.log(' M6 EXTENDED-SESSION ACTUAL MEMORY CREEP OBSERVATION');
    console.log('======================================================\n');

    // Initial GC
    await cdp.send('HeapProfiler.collectGarbage');
    await new Promise((r) => setTimeout(r, 200));

    // Warm-up (3 cycles)
    console.log('[MEMORY] Executing 3 warm-up lifecycle cycles...');
    for (let w = 0; w < 3; w++) {
      await safeClick(`[data-testid="doc-card-${doc100.id}"]`);
      await page.waitForFunction(() => Boolean(document.querySelector('.react-flow__node')));
      await page.keyboard.press('Tab');
      await safeClick('[data-testid="back-to-library-btn"]');
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="library-card-grid"]')));
      await cdp.send('HeapProfiler.collectGarbage');
      await new Promise((r) => setTimeout(r, 60));
      await cdp.send('HeapProfiler.collectGarbage');
    }

    const baselineMetrics = await cdp.send('Performance.getMetrics');
    const baselineHeap = baselineMetrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value || 0;
    console.log(`[MEMORY] Baseline Heap (post-warmup GC): ${(baselineHeap / 1024 / 1024).toFixed(2)} MB`);

    // 20 sequential lifecycle cycles
    const SAMPLES = 20;
    const peakHeapSamples = [];
    const postCleanupHeapSamples = [];
    const domNodeSamples = [];

    console.log(`[MEMORY] Observing ${SAMPLES} consecutive open/edit/undo/close cycles on 500-node document...`);

    for (let cycle = 1; cycle <= SAMPLES; cycle++) {
      // 1. Open document
      await safeClick(`[data-testid="doc-card-${doc500.id}"]`);
      await page.waitForFunction(() => Boolean(document.querySelector('.react-flow__node')));

      // 2. Perform editing & mutations
      await safeClick('.react-flow__node');
      await page.keyboard.press('Tab'); // add child
      await page.keyboard.down('Control');
      await page.keyboard.press('z'); // undo
      await page.keyboard.press('y'); // redo
      await page.keyboard.up('Control');

      // Sample active peak
      const activeMetrics = await cdp.send('Performance.getMetrics');
      const peakHeap = activeMetrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value || 0;
      peakHeapSamples.push(peakHeap);

      // 3. Return to Library & Close
      await safeClick('[data-testid="back-to-library-btn"]');
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="library-card-grid"]')));

      // 4. Garbage Collection (dual pass to sweep Blink Oilpan and V8 Heap)
      await cdp.send('HeapProfiler.collectGarbage');
      await new Promise((r) => setTimeout(r, 60));
      await cdp.send('HeapProfiler.collectGarbage');
      await new Promise((r) => setTimeout(r, 60));

      // 5. Sample post-cleanup heap and DOM nodes
      const postMetrics = await cdp.send('Performance.getMetrics');
      const postHeap = postMetrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value || 0;
      const domNodes = postMetrics.metrics.find((m) => m.name === 'Nodes')?.value || 0;

      postCleanupHeapSamples.push(postHeap);
      domNodeSamples.push(domNodes);

      if (cycle % 5 === 0 || cycle === 1) {
        console.log(
          `  Cycle ${cycle.toString().padStart(2)}: Peak = ${(peakHeap / 1024 / 1024).toFixed(2)} MB | ` +
          `Post-Cleanup = ${(postHeap / 1024 / 1024).toFixed(2)} MB | DOM Nodes = ${domNodes}`
        );
      }
    }

    // Compute statistics & Linear Regression slope across cycles
    const avgPeak = peakHeapSamples.reduce((a, b) => a + b, 0) / SAMPLES;
    const avgPost = postCleanupHeapSamples.reduce((a, b) => a + b, 0) / SAMPLES;

    // Linear regression on postCleanupHeap (MB) over cycle index [1..20]
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const x = i + 1;
      const y = postCleanupHeapSamples[i] / 1024 / 1024;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    const slopeMbPerCycle = (SAMPLES * sumXY - sumX * sumY) / (SAMPLES * sumXX - sumX * sumX);

    const baselineMb = baselineHeap / 1024 / 1024;
    const avgPeakMb = avgPeak / 1024 / 1024;
    const finalPostMb = postCleanupHeapSamples[SAMPLES - 1] / 1024 / 1024;

    console.log('\n======================================================');
    console.log(' OBSERVATION SUMMARY & EMPIRICAL EVIDENCE');
    console.log('======================================================');
    console.log(`Baseline Heap (after warm-up GC):     ${baselineMb.toFixed(2)} MB`);
    console.log(`Average Peak During 500-Node Session: ${avgPeakMb.toFixed(2)} MB`);
    console.log(`Final Post-Cleanup Heap (Cycle 20):   ${finalPostMb.toFixed(2)} MB`);
    console.log(`Linear Regression Slope:              ${slopeMbPerCycle.toFixed(4)} MB/cycle`);
    console.log(`Persistent Upward Creep Detected:     ${Math.abs(slopeMbPerCycle) < 0.05 ? 'NO (Flat Plateau / Bounded Oscillation)' : 'YES'}`);

    const results = {
      renderResults,
      selectDuration,
      panDuration,
      relayoutDuration,
      memory: {
        samples: SAMPLES,
        baselineMb,
        avgPeakMb,
        finalPostMb,
        slopeMbPerCycle,
        hasUpwardTrend: Math.abs(slopeMbPerCycle) >= 0.05,
      },
    };

    fs.writeFileSync(
      path.resolve(__dirname, 'm6-runtime-evidence.json'),
      JSON.stringify(results, null, 2),
      'utf-8'
    );
    console.log('\n[HARNESS] Detailed evidence saved to scripts/m6-runtime-evidence.json');
  } finally {
    await browser.close();
    server.close();
  }
}

runBenchmark().catch((err) => {
  console.error('[HARNESS ERROR]', err);
  process.exit(1);
});
