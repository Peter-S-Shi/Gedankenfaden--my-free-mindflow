import { CanonicalDocument } from './types';
import { cloneDocument } from './document';

export class HistoryManager {
  private undoStack: CanonicalDocument[] = [];
  private redoStack: CanonicalDocument[] = [];
  private current: CanonicalDocument;
  private maxHistory: number;

  constructor(initialDoc: CanonicalDocument, maxHistory = 50) {
    this.current = cloneDocument(initialDoc);
    this.maxHistory = maxHistory;
  }

  public getCurrent(): CanonicalDocument {
    return this.current;
  }

  public pushState(nextDoc: CanonicalDocument): void {
    this.undoStack.push(cloneDocument(this.current));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.current = cloneDocument(nextDoc);
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
}
