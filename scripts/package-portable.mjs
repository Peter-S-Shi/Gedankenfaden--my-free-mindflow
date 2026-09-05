/**
 * Gedankenfaden Windows Portable Distribution Packager
 * Packages the native release binary, documentation, and manifest into a standalone .zip
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fflate from 'fflate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('--- Gedankenfaden Windows Portable Packager ---');

  // Candidate executable paths
  const candidateExePaths = [
    path.resolve(rootDir, 'src-tauri/target/release/gedankenfaden.exe'),
    path.resolve(rootDir, 'target/release/gedankenfaden.exe'),
    path.resolve(rootDir, 'src-tauri/target/debug/gedankenfaden.exe'),
    path.resolve(rootDir, 'target/debug/gedankenfaden.exe'),
  ];

  let exePath = candidateExePaths.find((p) => fs.existsSync(p));

  if (!exePath) {
    console.error('Error: Could not locate built gedankenfaden.exe in target directories.');
    console.error('Please run `cargo build --release --manifest-path src-tauri/Cargo.toml` first.');
    process.exit(1);
  }

  console.log(`Using binary: ${exePath}`);
  const exeStats = fs.statSync(exePath);
  console.log(`Binary size: ${(exeStats.size / (1024 * 1024)).toFixed(2)} MB`);

  const outputDir = path.resolve(rootDir, 'dist-portable');
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const stagingDir = path.resolve(outputDir, 'Gedankenfaden-v1.0.0-windows-x64');
  fs.mkdirSync(stagingDir, { recursive: true });

  // 1. Copy executable
  const destExe = path.resolve(stagingDir, 'gedankenfaden.exe');
  fs.copyFileSync(exePath, destExe);

  // 2. Write README
  const readmeText = `======================================================================
Gedankenfaden - Local-First Visual Thinking Desktop
======================================================================

Version: 1.0.0
Architecture: Windows x86_64
Mode: Standalone Portable (No installation required)

GETTING STARTED:
1. Launch 'gedankenfaden.exe'.
2. Your documents and visual thinking libraries are stored in:
   %USERPROFILE%\\Documents\\Gedankenfaden
3. Fast metadata indexes and rolling crash recovery snapshots are kept in:
   %APPDATA%\\Gedankenfaden

FEATURES:
- Local-first canvas for mind maps and flowcharts.
- Direct .mflow and .json file I/O with Windows Explorer file association support.
- Non-destructive deletion via Windows Recycle Bin integration.
- Instant crash recovery and debounced rolling auto-saves.

Support & Project Source: https://github.com/Peter-S-Shi/Gedankenfaden--my-free-mindflow
======================================================================
`;
  fs.writeFileSync(path.resolve(stagingDir, 'README.txt'), readmeText, 'utf-8');

  // 3. Write Manifest
  const manifest = {
    name: 'Gedankenfaden',
    version: '1.0.0',
    platform: 'windows-x64',
    distributionType: 'portable',
    buildTimestamp: new Date().toISOString(),
    binary: {
      filename: 'gedankenfaden.exe',
      sizeBytes: exeStats.size,
    },
    supportedExtensions: ['.mflow', '.json'],
  };
  fs.writeFileSync(
    path.resolve(stagingDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  // 4. Create ZIP archive with fflate
  console.log('Compressing standalone portable zip archive...');
  const zipData = {};
  const exeBuffer = fs.readFileSync(destExe);
  zipData['Gedankenfaden-v1.0.0-windows-x64/gedankenfaden.exe'] = new Uint8Array(exeBuffer);
  zipData['Gedankenfaden-v1.0.0-windows-x64/README.txt'] = fflate.strToU8(readmeText);
  zipData['Gedankenfaden-v1.0.0-windows-x64/manifest.json'] = fflate.strToU8(
    JSON.stringify(manifest, null, 2)
  );

  const zipped = fflate.zipSync(zipData, { level: 6 });
  const zipPath = path.resolve(outputDir, 'Gedankenfaden-v1.0.0-windows-x64-portable.zip');
  fs.writeFileSync(zipPath, zipped);

  const zipStats = fs.statSync(zipPath);
  console.log(`Created portable package: ${zipPath}`);
  console.log(`Package size: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log('Portable packaging finished successfully.');
}

main().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
