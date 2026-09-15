/**
 * RC-A regression test.
 *
 * Fixes a genuine local-dev bug discovered during RC-A's own fail-closed
 * native release build verification: Vite's dependency-scanner otherwise
 * globs for HTML entry points across the whole project. After a real
 * `cargo build --release --manifest-path src-tauri/Cargo.toml`, Tauri's
 * build script writes generated codegen assets (including `.html` files)
 * under `src-tauri/target/`, and Vite's scanner picked those up as extra
 * entry points -- which starved/broke the two real-headless-Chrome
 * Puppeteer consumer tests (`f06-pdf-diagram-consumer.test.ts`,
 * `f09-browser-raster-consumer.test.ts`) whenever a native build had
 * already run on the same machine before `npm test`.
 *
 * This test loads the actual `vite.config.ts` (not a duplicated literal)
 * and asserts the fix is present, so a future edit can't silently drop it.
 */
import { describe, it, expect } from 'vitest';
import { loadConfigFromFile } from 'vite';

describe('RC-A: vite.config.ts scopes dependency-scan entries to the real app entry point', () => {
  it('resolves optimizeDeps.entries to only index.html, not a project-wide HTML glob', async () => {
    const result = await loadConfigFromFile({ command: 'serve', mode: 'development' });
    expect(result).not.toBeNull();
    expect(result!.config.optimizeDeps?.entries).toEqual(['index.html']);
  });
});
