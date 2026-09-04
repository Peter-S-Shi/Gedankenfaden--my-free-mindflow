export interface CanvasKeyboardCallbacks {
  onSave: () => void;
  onSearch: () => void;
  onToggleOutline: () => void;
  onToggleInspector: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onEditSelectedNode: () => void;
  onAddSiblingBelow: () => void;
  onAddSiblingAbove: () => void;
  onAddChild: () => void;
  onAddFlowchartDownstream: () => void;
  onAddFlowchartUpstream: () => void;
  onAddFlowchartBranch: () => void;
  onDeleteSelected: () => void;
  onArrowNavigation: (key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => void;
  onDeselect: () => void;
}

export type MinimalKeyEvent = {
  key?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  target?: any;
  preventDefault?: () => void;
};

/**
 * Checks whether the event target is an active text input element.
 * When true, canvas shortcuts must be strictly blocked to preserve native text editing.
 */
export function isTextInputElement(target: any): boolean {
  if (!target) return false;
  if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) {
    return true;
  }
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target.isContentEditable === true) {
    return true;
  }
  if (typeof target.getAttribute === 'function' && target.getAttribute('contenteditable') === 'true') {
    return true;
  }
  // Mock compatibility for Node / test environments
  if (target.constructor?.name === 'HTMLInputElement' || target.constructor?.name === 'HTMLTextAreaElement') {
    return true;
  }
  return false;
}

/**
 * Dispatches keydown events to canvas operations with strict text isolation.
 * Returns true if the key was intercepted and handled by the canvas, false otherwise.
 */
export function dispatchCanvasKeyDown(
  e: MinimalKeyEvent,
  mode: 'mindmap' | 'flowchart',
  callbacks: CanvasKeyboardCallbacks
): boolean {
  const isInput = isTextInputElement(e.target);
  const key = e.key || '';
  const ctrlKey = Boolean(e.ctrlKey);
  const shiftKey = Boolean(e.shiftKey);

  // Universal: Save (Ctrl+S) - always available
  if (ctrlKey && !shiftKey && key.toLowerCase() === 's') {
    e.preventDefault?.();
    callbacks.onSave();
    return true;
  }

  // Universal: Toggle Left Outline (Ctrl+\)
  if (ctrlKey && key === '\\') {
    e.preventDefault?.();
    callbacks.onToggleOutline();
    return true;
  }

  // Universal: Toggle Right Inspector (Ctrl+/)
  if (ctrlKey && key === '/') {
    e.preventDefault?.();
    callbacks.onToggleInspector();
    return true;
  }

  // Active only when NOT inside text editing
  if (isInput) {
    return false;
  }

  // Search / Outline (Ctrl+F)
  if (ctrlKey && !shiftKey && key.toLowerCase() === 'f') {
    e.preventDefault?.();
    callbacks.onSearch();
    return true;
  }

  // Undo (Ctrl+Z)
  if (ctrlKey && !shiftKey && key.toLowerCase() === 'z') {
    e.preventDefault?.();
    callbacks.onUndo();
    return true;
  }

  // Redo (Ctrl+Y or Ctrl+Shift+Z)
  if ((ctrlKey && key.toLowerCase() === 'y') || (ctrlKey && shiftKey && key.toLowerCase() === 'z')) {
    e.preventDefault?.();
    callbacks.onRedo();
    return true;
  }

  // Branch Copy (Ctrl+C)
  if (ctrlKey && !shiftKey && key.toLowerCase() === 'c') {
    e.preventDefault?.();
    callbacks.onCopy();
    return true;
  }

  // Branch Cut (Ctrl+X)
  if (ctrlKey && !shiftKey && key.toLowerCase() === 'x') {
    e.preventDefault?.();
    callbacks.onCut();
    return true;
  }

  // Branch Paste (Ctrl+V)
  if (ctrlKey && !shiftKey && key.toLowerCase() === 'v') {
    e.preventDefault?.();
    callbacks.onPaste();
    return true;
  }

  // Inline Node Text Edit (Space or F2)
  if (key === ' ' || key === 'F2') {
    e.preventDefault?.();
    callbacks.onEditSelectedNode();
    return true;
  }

  // Mode-specific node insertion
  if (mode === 'flowchart') {
    if (key === 'Enter' && !shiftKey) {
      e.preventDefault?.();
      callbacks.onAddFlowchartDownstream();
      return true;
    }
    if (key === 'Enter' && shiftKey) {
      e.preventDefault?.();
      callbacks.onAddFlowchartUpstream();
      return true;
    }
    if (key === 'Tab') {
      e.preventDefault?.();
      callbacks.onAddFlowchartBranch();
      return true;
    }
  } else {
    // Mind Map
    if (key === 'Enter' && !shiftKey) {
      e.preventDefault?.();
      callbacks.onAddSiblingBelow();
      return true;
    }
    if (key === 'Enter' && shiftKey) {
      e.preventDefault?.();
      callbacks.onAddSiblingAbove();
      return true;
    }
    if (key === 'Tab') {
      e.preventDefault?.();
      callbacks.onAddChild();
      return true;
    }
  }

  // Delete subtree (Delete or Backspace)
  if (key === 'Delete' || key === 'Backspace') {
    e.preventDefault?.();
    callbacks.onDeleteSelected();
    return true;
  }

  // Spatial / Graph Arrow Navigation
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    e.preventDefault?.();
    callbacks.onArrowNavigation(key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
    return true;
  }

  // Deselect (Escape)
  if (key === 'Escape') {
    e.preventDefault?.();
    callbacks.onDeselect();
    return true;
  }

  return false;
}
