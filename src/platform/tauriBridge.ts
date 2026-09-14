/**
 * Platform Native Bridge Abstraction for Gedankenfaden V1
 * Supports Tauri 2 desktop shell with fallback for browser & headless Vitest runner
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

const LIBRARY_CHANGED_EVENT = 'library-fs-changed';

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
  /** Last folder authorized as the active Library root in a prior session, if any. */
  getPersistedLibraryRoot(): Promise<string | null>;
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
  /** Starts (or moves) live observation of external changes to an authorized Library folder. */
  watchLibraryRoot(path: string): Promise<void>;
  /** Tears down the active Library watcher, if any. */
  unwatchLibraryRoot(): Promise<void>;
  /** Subscribes to external Library filesystem change notifications; returns an unsubscribe function. */
  onLibraryChanged(callback: () => void): () => void;
  /** Terminates the native application lifecycle cleanly via Rust app.exit(0). */
  closeAppWindow(): Promise<void>;
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

  async getPersistedLibraryRoot(): Promise<string | null> {
    return await invoke<string | null>('get_persisted_library_root');
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

  // Dialogs are invoked and their results authorized entirely on the Rust side
  // (see pick_folder_dialog / pick_document_file_dialog / pick_export_file_dialog
  // in src-tauri/src/main.rs) so that native filesystem authorization can never be
  // granted merely by a renderer-supplied string; only a path the user actually
  // picked through the OS dialog is trusted.
  async pickFolder(): Promise<string | null> {
    try {
      return await invoke<string | null>('pick_folder_dialog');
    } catch {
      return null;
    }
  }

  async pickDocumentFile(): Promise<string | null> {
    try {
      return await invoke<string | null>('pick_document_file_dialog');
    } catch {
      return null;
    }
  }

  async pickExportFile(suggestedFilename: string, extension: string): Promise<string | null> {
    try {
      return await invoke<string | null>('pick_export_file_dialog', {
        suggestedFilename,
        extension,
      });
    } catch {
      return null;
    }
  }

  async watchLibraryRoot(path: string): Promise<void> {
    await invoke('watch_library_root', { path });
  }

  async unwatchLibraryRoot(): Promise<void> {
    await invoke('unwatch_library_root');
  }

  onLibraryChanged(callback: () => void): () => void {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    listen(LIBRARY_CHANGED_EVENT, () => callback()).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }

  async closeAppWindow(): Promise<void> {
    try {
      await invoke('close_app_window');
    } catch {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().destroy();
      } catch {
        // ignore
      }
    }
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
  private persistedLibraryRoot: string | null = null;
  private watchedLibraryRoot: string | null = null;
  private libraryChangeListeners: Set<() => void> = new Set();

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

  async getPersistedLibraryRoot(): Promise<string | null> {
    return this.persistedLibraryRoot;
  }

  simulatePersistedLibraryRoot(path: string | null): void {
    this.persistedLibraryRoot = path;
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

  async watchLibraryRoot(path: string): Promise<void> {
    this.watchedLibraryRoot = this.normalize(path);
  }

  async unwatchLibraryRoot(): Promise<void> {
    this.watchedLibraryRoot = null;
  }

  onLibraryChanged(callback: () => void): () => void {
    this.libraryChangeListeners.add(callback);
    return () => {
      this.libraryChangeListeners.delete(callback);
    };
  }

  /** Test/simulation hook: fires an external Library filesystem change notification. */
  simulateExternalLibraryChange(): void {
    for (const listener of this.libraryChangeListeners) {
      listener();
    }
  }

  getWatchedLibraryRoot(): string | null {
    return this.watchedLibraryRoot;
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

  async closeAppWindow(): Promise<void> {
    // In-memory mock lifecycle termination
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
