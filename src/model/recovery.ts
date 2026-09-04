/**
 * Gedankenfaden Invisible Reliability & Crash Recovery Engine
 * Implements debounced autosave, atomic disk writes, crash journaling, and bounded rolling snapshot rotator
 */

import { CanonicalDocument } from './types';
import { serializeDocument, deserializeDocument } from './document';
import { getNativeBridge, INativeBridge } from '../platform/tauriBridge';

export interface SnapshotEntry {
  id: string;
  timestamp: string;
  reason: 'autosave' | 'manual' | 'crash_backup';
  docId: string;
  docTitle: string;
  filePath?: string;
  serialized: string;
}

export interface SessionJournal {
  activeDocId: string;
  activeDocTitle: string;
  startedAt: string;
  lastHeartbeat: string;
  isCleanShutdown: boolean;
}

export interface CrashDetectionResult {
  hasUnsavedOrCrash: boolean;
  uncleanSession?: SessionJournal;
  latestSnapshot?: SnapshotEntry;
}

const DEFAULT_SNAPSHOT_LIMIT = 5;
const RECOVERY_DIR_NAME = 'recovery';
const SESSION_JOURNAL_FILE = 'session.journal.json';

/**
 * Debounced Autosave Engine
 */
export class AutoSaveEngine {
  private timer: NodeJS.Timeout | null = null;
  private pendingDoc: CanonicalDocument | null = null;
  private pendingHandler: ((doc: CanonicalDocument) => Promise<void>) | null = null;
  private delayMs: number;

  constructor(delayMs = 500) {
    this.delayMs = delayMs;
  }

  scheduleSave(
    doc: CanonicalDocument,
    onSave: (doc: CanonicalDocument) => Promise<void>,
    delayOverride?: number
  ): void {
    this.cancelPending();
    this.pendingDoc = doc;
    this.pendingHandler = onSave;

    const delay = delayOverride !== undefined ? delayOverride : this.delayMs;
    this.timer = setTimeout(async () => {
      await this.flushPending();
    }, delay);
  }

  async flushPending(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingDoc && this.pendingHandler) {
      const doc = this.pendingDoc;
      const handler = this.pendingHandler;
      this.pendingDoc = null;
      this.pendingHandler = null;
      await handler(doc);
    }
  }

  cancelPending(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingDoc = null;
    this.pendingHandler = null;
  }

  isPending(): boolean {
    return this.timer !== null;
  }
}

/**
 * Atomic File Writer
 * Writes data to a temporary sibling file (.tmp), ensures flush, then atomically renames to target.
 * Prevents corrupted 0-byte files if process crashes or power is lost mid-write.
 */
export async function atomicWriteTextFile(
  targetPath: string,
  contents: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await bridge.writeTextFile(tmpPath, contents);
  await bridge.rename(tmpPath, targetPath);
}

export async function atomicWriteBinaryFile(
  targetPath: string,
  contents: Uint8Array,
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await bridge.writeBinaryFile(tmpPath, contents);
  await bridge.rename(tmpPath, targetPath);
}

/**
 * Bounded Rolling Snapshot Rotator
 */
function getRecoveryPath(appDataDir: string, filename: string): string {
  return `${appDataDir}/${RECOVERY_DIR_NAME}/${filename}`.replace(/\\/g, '/');
}

export async function saveRollingSnapshot(
  doc: CanonicalDocument,
  reason: 'autosave' | 'manual' | 'crash_backup' = 'autosave',
  maxSnapshots = DEFAULT_SNAPSHOT_LIMIT,
  bridge: INativeBridge = getNativeBridge()
): Promise<SnapshotEntry> {
  const appData = await bridge.getAppDataDir();
  const recoveryDir = `${appData}/${RECOVERY_DIR_NAME}`.replace(/\\/g, '/');
  if (!(await bridge.exists(recoveryDir))) {
    await bridge.createDir(recoveryDir, { recursive: true });
  }

  const manifestPath = getRecoveryPath(appData, `snapshots_${doc.id}.json`);
  let snapshots: SnapshotEntry[] = [];

  if (await bridge.exists(manifestPath)) {
    try {
      const raw = await bridge.readTextFile(manifestPath);
      snapshots = JSON.parse(raw);
    } catch {
      snapshots = [];
    }
  }

  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const entry: SnapshotEntry = {
    id: snapshotId,
    timestamp: new Date().toISOString(),
    reason,
    docId: doc.id,
    docTitle: doc.title,
    serialized: serializeDocument(doc),
  };

  snapshots.unshift(entry);

  // Enforce bounded limit
  if (snapshots.length > maxSnapshots) {
    snapshots = snapshots.slice(0, maxSnapshots);
  }

  await atomicWriteTextFile(manifestPath, JSON.stringify(snapshots, null, 2), bridge);
  return entry;
}

export async function getRecentSnapshots(
  docId: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<SnapshotEntry[]> {
  const appData = await bridge.getAppDataDir();
  const manifestPath = getRecoveryPath(appData, `snapshots_${docId}.json`);

  if (await bridge.exists(manifestPath)) {
    try {
      const raw = await bridge.readTextFile(manifestPath);
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

export async function restoreDocumentFromSnapshot(snapshot: SnapshotEntry): Promise<CanonicalDocument> {
  return deserializeDocument(snapshot.serialized);
}

export async function clearSnapshots(
  docId: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  const appData = await bridge.getAppDataDir();
  const manifestPath = getRecoveryPath(appData, `snapshots_${docId}.json`);
  if (await bridge.exists(manifestPath)) {
    await bridge.removeFile(manifestPath);
  }
}

/**
 * Crash Detection & Session Journaling
 */
export async function markSessionActive(
  docId: string,
  docTitle: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  const appData = await bridge.getAppDataDir();
  const journalPath = getRecoveryPath(appData, SESSION_JOURNAL_FILE);
  const now = new Date().toISOString();

  const journal: SessionJournal = {
    activeDocId: docId,
    activeDocTitle: docTitle,
    startedAt: now,
    lastHeartbeat: now,
    isCleanShutdown: false,
  };

  await atomicWriteTextFile(journalPath, JSON.stringify(journal, null, 2), bridge);
}

export async function heartbeatSession(
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  const appData = await bridge.getAppDataDir();
  const journalPath = getRecoveryPath(appData, SESSION_JOURNAL_FILE);

  if (await bridge.exists(journalPath)) {
    try {
      const raw = await bridge.readTextFile(journalPath);
      const journal: SessionJournal = JSON.parse(raw);
      journal.lastHeartbeat = new Date().toISOString();
      await atomicWriteTextFile(journalPath, JSON.stringify(journal, null, 2), bridge);
    } catch {
      // ignore corrupt journal heartbeat
    }
  }
}

export async function markSessionClean(
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  const appData = await bridge.getAppDataDir();
  const journalPath = getRecoveryPath(appData, SESSION_JOURNAL_FILE);

  if (await bridge.exists(journalPath)) {
    try {
      const raw = await bridge.readTextFile(journalPath);
      const journal: SessionJournal = JSON.parse(raw);
      journal.isCleanShutdown = true;
      journal.lastHeartbeat = new Date().toISOString();
      await atomicWriteTextFile(journalPath, JSON.stringify(journal, null, 2), bridge);
    } catch {
      // ignore
    }
  }
}

export async function detectCrashOrUnsaved(
  bridge: INativeBridge = getNativeBridge()
): Promise<CrashDetectionResult> {
  const appData = await bridge.getAppDataDir();
  const journalPath = getRecoveryPath(appData, SESSION_JOURNAL_FILE);

  if (!(await bridge.exists(journalPath))) {
    return { hasUnsavedOrCrash: false };
  }

  try {
    const raw = await bridge.readTextFile(journalPath);
    const journal: SessionJournal = JSON.parse(raw);

    if (!journal.isCleanShutdown) {
      // Abnormal exit detected! Check if snapshots exist for this document
      const snapshots = await getRecentSnapshots(journal.activeDocId, bridge);
      const latestSnapshot = snapshots.length > 0 ? snapshots[0] : undefined;

      return {
        hasUnsavedOrCrash: true,
        uncleanSession: journal,
        latestSnapshot,
      };
    }
  } catch {
    return { hasUnsavedOrCrash: false };
  }

  return { hasUnsavedOrCrash: false };
}
