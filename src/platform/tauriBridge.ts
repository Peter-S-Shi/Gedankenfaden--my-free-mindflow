/**
 * Platform Native Bridge Abstraction for Gedankenfaden V1
 * Supports Tauri 2 desktop shell with fallback for browser & headless Vitest runner
 */

import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  updatedAt?: string;
}

export interface INativeBridge {
  isTauri(): boolean;
  getAppDataDir(): Promise<string>;
  getDefaultDocumentsDir(): Promise<string>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  writeBinaryFile(path: string, contents: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  createDir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  trashFile(path: string): Promise<void>;
  readDir(path: string): Promise<FileEntry[]>;
  getCliOpenFile(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  pickDocumentFile(): Promise<string | null>;
  pickExportFile(suggestedFilename: string, extension: string): Promise<string | null>;
}

export function isRunningInTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
}

/**
 * Production Tauri 2 native bridge backed by Rust IPC and native Windows APIs
 */
export class TauriNativeBridge implements INativeBridge {
  isTauri(): boolean {
    return true;
  }

  async getAppDataDir(): Promise<string> {
    return await invoke<string>('get_app_data_dir');
  }

  async getDefaultDocumentsDir(): Promise<string> {
    return await invoke<string>('get_default_documents_dir');
  }

  async readTextFile(path: string): Promise<string> {
    return await invoke<string>('read_text_file', { path });
  }

  async writeTextFile(path: string, contents: string): Promise<void> {
    await invoke('write_text_file', { path, contents });
  }

  async readBinaryFile(path: string): Promise<Uint8Array> {
    const raw = await invoke<number[]>('read_binary_file', { path });
    return new Uint8Array(raw);
  }

  async writeBinaryFile(path: string, contents: Uint8Array): Promise<void> {
    await invoke('write_binary_file', { path, contents: Array.from(contents) });
  }

  async exists(path: string): Promise<boolean> {
    return await invoke<boolean>('file_exists', { path });
  }

  async createDir(path: string, _options?: { recursive?: boolean }): Promise<void> {
    await invoke('create_dir_all', { path });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await invoke('rename_file', { oldPath, newPath });
  }

  async removeFile(path: string): Promise<void> {
    await invoke('remove_file', { path });
  }

  async trashFile(path: string): Promise<void> {
    await invoke('trash_document_file', { path });
  }

  async readDir(path: string): Promise<FileEntry[]> {
    return await invoke<FileEntry[]>('read_dir_entries', { path });
  }

  async getCliOpenFile(): Promise<string | null> {
    return await invoke<string | null>('get_cli_open_file');
  }

  async pickFolder(): Promise<string | null> {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Gedankenfaden Library Folder',
      });
      if (typeof selected === 'string') return selected.replace(/\\/g, '/');
      return null;
    } catch {
      return null;
    }
  }

  async pickDocumentFile(): Promise<string | null> {
    try {
      const selected = await open({
        multiple: false,
        title: 'Import Document into Gedankenfaden',
        filters: [
          {
            name: 'All Supported Documents (*.mflow, *.json, *.md, *.opml)',
            extensions: ['mflow', 'json', 'md', 'markdown', 'opml'],
          },
          { name: 'Gedankenfaden Package (*.mflow)', extensions: ['mflow'] },
          { name: 'Canonical JSON (*.json)', extensions: ['json'] },
          { name: 'Markdown Document (*.md, *.markdown)', extensions: ['md', 'markdown'] },
          { name: 'OPML Outline (*.opml)', extensions: ['opml'] },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ],
      });
      if (typeof selected === 'string') return selected.replace(/\\/g, '/');
      return null;
    } catch {
      return null;
    }
  }

  async pickExportFile(suggestedFilename: string, extension: string): Promise<string | null> {
    const selected = await save({
      title: 'Export Gedankenfaden Document',
      defaultPath: suggestedFilename,
      filters: [{ name: `${extension.toUpperCase()} file`, extensions: [extension] }],
    });
    return typeof selected === 'string' ? selected.replace(/\\/g, '/') : null;
  }
}

/**
 * In-Memory & LocalStorage backed bridge for browser, CI and Vitest suites
 */
export class MemoryMockNativeBridge implements INativeBridge {
  private files: Map<string, string | Uint8Array> = new Map();
  private dirs: Set<string> = new Set(['/appdata', '/documents']);
  private trashedFiles: Map<string, string | Uint8Array> = new Map();

  constructor(initialFiles?: Record<string, string | Uint8Array>) {
    if (initialFiles) {
      for (const [p, content] of Object.entries(initialFiles)) {
        this.files.set(this.normalize(p), content);
      }
    }
  }

  private cliOpenFile: string | null = null;
  private pickedFolder: string | null = null;
  private pickedDocumentFile: string | null = null;
  private pickedExportFile: string | null = null;

  private normalize(p: string): string {
    return p.replace(/\\/g, '/');
  }

  private ensureParentDirs(filePath: string): void {
    const norm = this.normalize(filePath);
    const lastSlash = norm.lastIndexOf('/');
    if (lastSlash > 0) {
      let current = '';
      const parts = norm.substring(0, lastSlash).split('/');
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        this.dirs.add(current);
      }
    }
  }

  isTauri(): boolean {
    return false;
  }

  async getAppDataDir(): Promise<string> {
    return 'C:/Users/default/AppData/Roaming/Gedankenfaden';
  }

  async getDefaultDocumentsDir(): Promise<string> {
    return 'C:/Users/default/Documents/Gedankenfaden';
  }

  async readTextFile(path: string): Promise<string> {
    const key = this.normalize(path);
    const item = this.files.get(key);
    if (item === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    if (typeof item === 'string') return item;
    return new TextDecoder().decode(item);
  }

  async writeTextFile(path: string, contents: string): Promise<void> {
    this.ensureParentDirs(path);
    this.files.set(this.normalize(path), contents);
  }

  async readBinaryFile(path: string): Promise<Uint8Array> {
    const key = this.normalize(path);
    const item = this.files.get(key);
    if (item === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    if (item instanceof Uint8Array) return item;
    return new TextEncoder().encode(item);
  }

  async writeBinaryFile(path: string, contents: Uint8Array): Promise<void> {
    this.ensureParentDirs(path);
    this.files.set(this.normalize(path), contents);
  }

  async exists(path: string): Promise<boolean> {
    const key = this.normalize(path);
    if (this.files.has(key) || this.dirs.has(key)) return true;
    const prefix = key.replace(/\/$/, '') + '/';
    for (const f of this.files.keys()) {
      if (f.startsWith(prefix)) return true;
    }
    return false;
  }

  async createDir(path: string, _options?: { recursive?: boolean }): Promise<void> {
    this.dirs.add(this.normalize(path));
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldKey = this.normalize(oldPath);
    const newKey = this.normalize(newPath);
    const content = this.files.get(oldKey);
    if (content === undefined) {
      throw new Error(`Cannot rename non-existent file: ${oldPath}`);
    }
    this.ensureParentDirs(newPath);
    this.files.delete(oldKey);
    this.files.set(newKey, content);
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(this.normalize(path));
  }

  async trashFile(path: string): Promise<void> {
    const key = this.normalize(path);
    const content = this.files.get(key);
    if (content !== undefined) {
      this.files.delete(key);
      this.trashedFiles.set(key, content);
    }
  }

  getTrashedFiles(): Map<string, string | Uint8Array> {
    return this.trashedFiles;
  }

  simulateCliOpenFile(path: string | null): void {
    this.cliOpenFile = path;
  }

  simulatePickedFolder(path: string | null): void {
    this.pickedFolder = path;
  }

  simulatePickedDocumentFile(path: string | null): void {
    this.pickedDocumentFile = path;
  }

  simulatePickedExportFile(path: string | null): void {
    this.pickedExportFile = path;
  }

  async getCliOpenFile(): Promise<string | null> {
    return this.cliOpenFile;
  }

  async pickFolder(): Promise<string | null> {
    return this.pickedFolder;
  }

  async pickDocumentFile(): Promise<string | null> {
    return this.pickedDocumentFile;
  }

  async pickExportFile(_suggestedFilename: string, _extension: string): Promise<string | null> {
    return this.pickedExportFile;
  }

  async readDir(dirPath: string): Promise<FileEntry[]> {
    const normDir = this.normalize(dirPath).replace(/\/$/, '') + '/';
    const entries: FileEntry[] = [];
    const seenNames = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(normDir)) {
        const sub = filePath.substring(normDir.length);
        const parts = sub.split('/');
        const name = parts[0];
        if (!seenNames.has(name)) {
          seenNames.add(name);
          const isDir = parts.length > 1;
          const fullPath = normDir + name;
          const content = this.files.get(filePath);
          const size = content ? (typeof content === 'string' ? content.length : content.byteLength) : 0;
          entries.push({
            name,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? undefined : size,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    return entries;
  }
}

let activeBridge: INativeBridge | null = null;

export function getNativeBridge(): INativeBridge {
  if (!activeBridge) {
    if (isRunningInTauri()) {
      activeBridge = new TauriNativeBridge();
    } else {
      activeBridge = new MemoryMockNativeBridge();
    }
  }
  return activeBridge;
}

export function setNativeBridge(bridge: INativeBridge): void {
  activeBridge = bridge;
}

export function resetNativeBridge(): void {
  activeBridge = null;
}
