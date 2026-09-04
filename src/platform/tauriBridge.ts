/**
 * Platform Native Bridge Abstraction for Gedankenfaden V1
 * Supports Tauri 2 desktop shell with fallback for browser & headless Vitest runner
 */

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
  readDir(path: string): Promise<FileEntry[]>;
}

/**
 * In-Memory & LocalStorage backed bridge for browser, CI and Vitest suites
 */
export class MemoryMockNativeBridge implements INativeBridge {
  private files: Map<string, string | Uint8Array> = new Map();
  private dirs: Set<string> = new Set(['/appdata', '/documents']);

  constructor(initialFiles?: Record<string, string | Uint8Array>) {
    if (initialFiles) {
      for (const [p, content] of Object.entries(initialFiles)) {
        this.files.set(this.normalize(p), content);
      }
    }
  }

  private normalize(p: string): string {
    return p.replace(/\\/g, '/');
  }

  isTauri(): boolean {
    return false;
  }

  async getAppDataDir(): Promise<string> {
    return '/appdata/Gedankenfaden';
  }

  async getDefaultDocumentsDir(): Promise<string> {
    return '/documents/Gedankenfaden';
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
    this.files.set(this.normalize(path), contents);
  }

  async exists(path: string): Promise<boolean> {
    const key = this.normalize(path);
    return this.files.has(key) || this.dirs.has(key);
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
    this.files.delete(oldKey);
    this.files.set(newKey, content);
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(this.normalize(path));
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

let activeBridge: INativeBridge = new MemoryMockNativeBridge();

export function getNativeBridge(): INativeBridge {
  return activeBridge;
}

export function setNativeBridge(bridge: INativeBridge): void {
  activeBridge = bridge;
}
