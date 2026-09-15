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

// RC-A: package.json is the single source of truth for the release version
// (previously "1.0.0" was hardcoded in this script independently of
// package.json, so a version bump here silently drifted from the actual
// release version). The raw semver string (which may carry a prerelease
// identifier such as "-1") is what candidate builds must be labeled with, per
// the RC-A truthfulness requirement -- never mark a candidate build 2.0.0.
//
// The prerelease identifier is kept numeric-only (e.g. "2.0.0-1", not
// "2.0.0-rc.1"): Tauri's Windows MSI/WiX bundler rejects any pre-release
// identifier that isn't a bare number ("optional pre-release identifier in
// app version must be numeric-only ... for msi target"), discovered when
// `npx tauri build` failed to bundle the MSI target during RC-A's own
// fail-closed verification. The human-readable "RC" label is derived here
// instead of embedded in the semver itself.
const { version: packageVersion } = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf-8')
);
const [baseVersion, prereleaseId] = packageVersion.split('-');
const isReleaseCandidate = Boolean(prereleaseId);
const displayVersion = isReleaseCandidate
  ? `${baseVersion} RC${prereleaseId}`
  : baseVersion;

async function main() {
  console.log(`--- Gedankenfaden Windows Portable Packager (v${packageVersion}) ---`);

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

  const stagingName = `Gedankenfaden-v${packageVersion}-windows-x64`;
  const stagingDir = path.resolve(outputDir, stagingName);
  fs.mkdirSync(stagingDir, { recursive: true });

  // 1. Copy executable
  const destExe = path.resolve(stagingDir, 'gedankenfaden.exe');
  fs.copyFileSync(exePath, destExe);

  // 2. Write README
  const readmeText = `======================================================================
Gedankenfaden - Local-First Visual Thinking Desktop
======================================================================

Version: ${displayVersion}${isReleaseCandidate ? ' (RELEASE CANDIDATE -- not a final release)' : ''}
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
    version: packageVersion,
    displayVersion,
    releaseChannel: isReleaseCandidate ? 'rc' : 'stable',
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
  zipData[`${stagingName}/gedankenfaden.exe`] = new Uint8Array(exeBuffer);
  zipData[`${stagingName}/README.txt`] = fflate.strToU8(readmeText);
  zipData[`${stagingName}/manifest.json`] = fflate.strToU8(
    JSON.stringify(manifest, null, 2)
  );

  const zipped = fflate.zipSync(zipData, { level: 6 });
  const zipPath = path.resolve(outputDir, `${stagingName}-portable.zip`);
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
