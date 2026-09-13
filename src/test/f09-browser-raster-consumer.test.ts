import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const chrome = [
  join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].find((candidate) => candidate && existsSync(candidate));

declare global {
  var __gedankenExport: {
    exportToPNG(doc: unknown): Promise<Uint8Array>;
    exportToJPEG(doc: unknown): Promise<Uint8Array>;
  };
}

describe.skipIf(!chrome)('F04/F05 browser raster consumer', () => {
  it('exports PNG and JPEG that a real browser image decoder can consume', async () => {
    const { default: puppeteer } = await import('puppeteer-core');
    const { createServer } = await import('vite');
    const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
    await server.listen();
    const baseUrl = server.resolvedUrls!.local[0];
    const browser = await puppeteer.launch({
      executablePath: chrome || '',
      headless: true,
      timeout: 15000,
      protocolTimeout: 15000,
      args: ['--disable-gpu', '--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.goto(baseUrl);
      await page.addScriptTag({
        type: 'module',
        content: `import * as exporter from '${baseUrl}src/export/exporter.ts'; globalThis.__gedankenExport = exporter;`,
      });
      await page.waitForFunction('globalThis.__gedankenExport');
      const result = await page.evaluate(async () => {
        const doc = {
          schemaVersion: '1.0', id: 'raster', title: 'Raster consumer', mode: 'flowchart',
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          viewport: { x: 0, y: 0, zoom: 1 },
          theme: { paletteId: 'nordic-slate', canvasBackground: 'blank', fontFamily: 'sans', defaultEdgeRouting: 'orthogonal' },
          nodes: [{ id: 'node', text: 'Visible node', shape: 'diamond', geometry: { x: 20, y: 20, width: 160, height: 80 } }],
          edges: [], groups: [],
        };
        const pngBytes = await globalThis.__gedankenExport.exportToPNG(doc);
        const jpegBytes = await globalThis.__gedankenExport.exportToJPEG(doc);
        const png = new Blob([new Uint8Array(pngBytes).buffer], { type: 'image/png' });
        const jpeg = new Blob([new Uint8Array(jpegBytes).buffer], { type: 'image/jpeg' });
        const [pngImage, jpegImage] = await Promise.all([createImageBitmap(png), createImageBitmap(jpeg)]);
        return { pngWidth: pngImage.width, jpegWidth: jpegImage.width, pngBytes: png.size, jpegBytes: jpeg.size };
      });
      expect(result).toMatchObject({ pngWidth: 280, jpegWidth: 280 });
      expect(result.pngBytes).toBeGreaterThan(100);
      expect(result.jpegBytes).toBeGreaterThan(100);
    } finally {
      await browser.close();
      await server.close();
    }
  }, 45000);
});
