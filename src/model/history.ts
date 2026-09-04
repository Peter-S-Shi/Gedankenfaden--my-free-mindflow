import { CanonicalDocument } from './types';
import { cloneDocument } from './document';

export class HistoryManager {
  private undoStack: CanonicalDocument[] = [];
  private redoStack: CanonicalDocument[] = [];
  private current: CanonicalDocument;
  private maxHistory: number;
  private transactionBaseState: CanonicalDocument | null = null;
  private isBatching = false;

  constructor(initialDoc: CanonicalDocument, maxHistory = 50) {
    this.current = cloneDocument(initialDoc);
    this.maxHistory = maxHistory;
  }

  public getCurrent(): CanonicalDocument {
    return this.current;
  }

  public pushState(nextDoc: CanonicalDocument): void {
    if (this.isBatching) {
      // While batching, update current state without pushing to undo stack yet
      this.current = cloneDocument(nextDoc);
      return;
    }

    this.undoStack.push(cloneDocument(this.current));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.current = cloneDocument(nextDoc);
  }

  public beginTransaction(): void {
    if (!this.isBatching) {
      this.isBatching = true;
      this.transactionBaseState = cloneDocument(this.current);
    }
  }

  public commitTransaction(finalDoc?: CanonicalDocument): void {
    if (!this.isBatching) return;

    const base = this.transactionBaseState;
    this.isBatching = false;
    this.transactionBaseState = null;

    if (finalDoc) {
      this.current = cloneDocument(finalDoc);
    }

    if (base && JSON.stringify(base) !== JSON.stringify(this.current)) {
      this.undoStack.push(base);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }
  }

  public rollbackTransaction(): CanonicalDocument | null {
    if (!this.isBatching || !this.transactionBaseState) return null;

    const base = this.transactionBaseState;
    this.isBatching = false;
    this.transactionBaseState = null;
    this.current = cloneDocument(base);
    return cloneDocument(this.current);
  }

  public isTransactionActive(): boolean {
    return this.isBatching;
  }

  public batchTransaction<T>(fn: () => T, getDoc?: () => CanonicalDocument): T {
    this.beginTransaction();
    try {
      const result = fn();
      const finalDoc = getDoc ? getDoc() : undefined;
      this.commitTransaction(finalDoc);
      return result;
    } catch (err) {
      this.rollbackTransaction();
      throw err;
    }
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): CanonicalDocument | null {
    if (!this.canUndo()) return null;
    const previous = this.undoStack.pop()!;
    this.redoStack.push(cloneDocument(this.current));
    this.current = previous;
    return cloneDocument(this.current);
  }

  public redo(): CanonicalDocument | null {
    if (!this.canRedo()) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(cloneDocument(this.current));
    this.current = next;
    return cloneDocument(this.current);
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.isBatching = false;
    this.transactionBaseState = null;
  }
}
