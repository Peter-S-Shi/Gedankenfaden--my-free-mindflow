import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'node:url';

const chrome = [
  join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].find((candidate) => candidate && existsSync(candidate));

declare global {
  var __gedankenPdfExport: { exportToPDF(doc: unknown): Promise<Uint8Array> };
}

describe.skipIf(!chrome)('F06 printable PDF diagram export', () => {
  it('is parsed by a PDF consumer with diagram text and vector geometry', async () => {
    const { default: puppeteer } = await import('puppeteer-core');
    const { createServer } = await import('vite');
    const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
    await server.listen();
    const baseUrl = server.resolvedUrls!.local[0];
    const browser = await puppeteer.launch({ executablePath: chrome || '', headless: true, timeout: 15000, protocolTimeout: 15000, args: ['--disable-gpu', '--no-sandbox'] });
    let exported: number[];
    try {
      const browserPage = await browser.newPage();
      await browserPage.goto(baseUrl);
      await browserPage.addScriptTag({ type: 'module', content: `import * as exporter from '${baseUrl}src/export/exporter.ts'; globalThis.__gedankenPdfExport = exporter;` });
      await browserPage.waitForFunction('globalThis.__gedankenPdfExport');
      exported = await browserPage.evaluate(async () => {
        const doc = {
          schemaVersion: '1.0', id: 'pdf', title: 'Printable workflow', mode: 'flowchart',
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', viewport: { x: 0, y: 0, zoom: 1 },
          theme: { paletteId: 'nordic-slate', canvasBackground: 'blank', fontFamily: 'sans', defaultEdgeRouting: 'orthogonal' },
          nodes: [
            { id: 'start', text: 'Start work', shape: 'pill', geometry: { x: 0, y: 0, width: 120, height: 48 } },
            { id: 'review', text: '审阅结果', shape: 'diamond', geometry: { x: 230, y: 90, width: 150, height: 80 } },
            { id: 'finish', text: 'Finish', shape: 'rectangle', geometry: { x: 490, y: 20, width: 120, height: 48 } },
          ],
          edges: [
            { id: 'first', source: 'start', target: 'review', sourceHandle: 'right', targetHandle: 'left', type: 'orthogonal', label: '检查' },
            { id: 'second', source: 'review', target: 'finish', sourceHandle: 'right', targetHandle: 'left', type: 'straight' },
          ],
          groups: [{ id: 'phase', title: 'Phase one', nodeIds: ['start', 'review'], bounds: { x: -24, y: -32, width: 430, height: 230 } }],
        };
        return Array.from(await globalThis.__gedankenPdfExport.exportToPDF(doc));
      });
    } finally {
      await browser.close();
      await server.close();
    }

    const loading = getDocument({
      data: new Uint8Array(exported),
      cMapUrl: `${fileURLToPath(new URL('../../node_modules/pdfjs-dist/cmaps/', import.meta.url)).replace(/\\/g, '/')}/`,
      cMapPacked: true,
      standardFontDataUrl: `${fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replace(/\\/g, '/')}/`,
    });
    const pdf = await loading.promise;
    try {
      expect(pdf.numPages).toBe(1);
      const page = await pdf.getPage(1);
      const text = (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
      const compactText = text.replace(/\s/g, '');
      expect(text).toContain('Start work');
      expect(compactText).toContain('审阅结果');
      expect(text).toContain('Finish');
      expect(compactText).toContain('检查');
      expect(text).toContain('Phase one');

      const operators = await page.getOperatorList();
      const vectorPaths = operators.fnArray.filter((operator) => operator === OPS.constructPath);
      expect(vectorPaths.length).toBeGreaterThanOrEqual(6);
      expect(page.getViewport({ scale: 1 }).width).toBeGreaterThan(500);
    } finally {
      await loading.destroy();
    }
  }, 45000);
});
