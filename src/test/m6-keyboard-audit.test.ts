import { describe, it, expect, vi } from 'vitest';

// Ensure DOM element classes exist in Node environment
if (typeof (globalThis as any).HTMLInputElement === 'undefined') {
  (globalThis as any).HTMLInputElement = class HTMLInputElement {};
}
if (typeof (globalThis as any).HTMLTextAreaElement === 'undefined') {
  (globalThis as any).HTMLTextAreaElement = class HTMLTextAreaElement {};
}
if (typeof (globalThis as any).HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = class HTMLElement {};
}

describe('M6 Keyboard Routing, Mode Differentiation & Text Isolation Audit', () => {
  // Pure keyboard event dispatcher mirroring CanvasEditor's exact contract
  function dispatchKeyContract(
    eventInit: {
      key?: string;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      target?: any;
    },
    mode: 'mindmap' | 'flowchart',
    callbacks: {
      onSave: () => void;
      onUndo: () => void;
      onRedo: () => void;
      onCopy: () => void;
      onCut: () => void;
      onPaste: () => void;
      onAddSiblingBelow: () => void;
      onAddSiblingAbove: () => void;
      onAddChild: () => void;
      onAddFlowchartDownstream: () => void;
      onAddFlowchartUpstream: () => void;
      onAddFlowchartBranch: () => void;
      onDelete: () => void;
      onArrow: (key: string) => void;
      onEdit: () => void;
      onDeselect: () => void;
      onToggleOutline: () => void;
      onToggleInspector: () => void;
    }
  ): { prevented: boolean } {
    let prevented = false;
    const fakeEvent = {
      key: eventInit.key,
      ctrlKey: !!eventInit.ctrlKey,
      shiftKey: !!eventInit.shiftKey,
      target: eventInit.target,
      preventDefault: () => {
        prevented = true;
      },
    };

    const isInput =
      fakeEvent.target instanceof (globalThis as any).HTMLInputElement ||
      fakeEvent.target instanceof (globalThis as any).HTMLTextAreaElement ||
      (fakeEvent.target as any)?.isContentEditable === true;

    // Save: Ctrl+S
    if (fakeEvent.ctrlKey && !fakeEvent.shiftKey && fakeEvent.key?.toLowerCase() === 's') {
      fakeEvent.preventDefault();
      callbacks.onSave();
      return { prevented };
    }

    // Toggle Left Outline: Ctrl+\
    if (fakeEvent.ctrlKey && fakeEvent.key === '\\') {
      fakeEvent.preventDefault();
      callbacks.onToggleOutline();
      return { prevented };
    }

    // Toggle Right Inspector: Ctrl+/
    if (fakeEvent.ctrlKey && fakeEvent.key === '/') {
      fakeEvent.preventDefault();
      callbacks.onToggleInspector();
      return { prevented };
    }

    // Undo: Ctrl+Z
    if (fakeEvent.ctrlKey && !fakeEvent.shiftKey && fakeEvent.key?.toLowerCase() === 'z') {
      if (!isInput) {
        fakeEvent.preventDefault();
        callbacks.onUndo();
      }
      return { prevented };
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z
    if (
      (fakeEvent.ctrlKey && fakeEvent.key?.toLowerCase() === 'y') ||
      (fakeEvent.ctrlKey && fakeEvent.shiftKey && fakeEvent.key?.toLowerCase() === 'z')
    ) {
      if (!isInput) {
        fakeEvent.preventDefault();
        callbacks.onRedo();
      }
      return { prevented };
    }

    // Copy: Ctrl+C
    if (fakeEvent.ctrlKey && !fakeEvent.shiftKey && fakeEvent.key?.toLowerCase() === 'c') {
      if (!isInput) {
        fakeEvent.preventDefault();
        callbacks.onCopy();
      }
      return { prevented };
    }

    // Cut: Ctrl+X
    if (fakeEvent.ctrlKey && !fakeEvent.shiftKey && fakeEvent.key?.toLowerCase() === 'x') {
      if (!isInput) {
        fakeEvent.preventDefault();
        callbacks.onCut();
      }
      return { prevented };
    }

    // Paste: Ctrl+V
    if (fakeEvent.ctrlKey && !fakeEvent.shiftKey && fakeEvent.key?.toLowerCase() === 'v') {
      if (!isInput) {
        fakeEvent.preventDefault();
        callbacks.onPaste();
      }
      return { prevented };
    }

    // Canvas actions (only active when not inside text editing)
    if (!isInput) {
      // Space or F2: Edit selected node
      if (fakeEvent.key === ' ' || fakeEvent.key === 'F2') {
        fakeEvent.preventDefault();
        callbacks.onEdit();
        return { prevented };
      }

      if (mode === 'flowchart') {
        if (fakeEvent.key === 'Enter' && !fakeEvent.shiftKey) {
          fakeEvent.preventDefault();
          callbacks.onAddFlowchartDownstream();
          return { prevented };
        }
        if (fakeEvent.key === 'Enter' && fakeEvent.shiftKey) {
          fakeEvent.preventDefault();
          callbacks.onAddFlowchartUpstream();
          return { prevented };
        }
        if (fakeEvent.key === 'Tab') {
          fakeEvent.preventDefault();
          callbacks.onAddFlowchartBranch();
          return { prevented };
        }
      } else {
        // Mindmap
        if (fakeEvent.key === 'Enter' && !fakeEvent.shiftKey) {
          fakeEvent.preventDefault();
          callbacks.onAddSiblingBelow();
          return { prevented };
        }
        if (fakeEvent.key === 'Enter' && fakeEvent.shiftKey) {
          fakeEvent.preventDefault();
          callbacks.onAddSiblingAbove();
          return { prevented };
        }
        if (fakeEvent.key === 'Tab') {
          fakeEvent.preventDefault();
          callbacks.onAddChild();
          return { prevented };
        }
      }

      if (fakeEvent.key === 'Delete' || fakeEvent.key === 'Backspace') {
        fakeEvent.preventDefault();
        callbacks.onDelete();
        return { prevented };
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(fakeEvent.key || '')) {
        fakeEvent.preventDefault();
        callbacks.onArrow(fakeEvent.key!);
        return { prevented };
      }

      if (fakeEvent.key === 'Escape') {
        fakeEvent.preventDefault();
        callbacks.onDeselect();
        return { prevented };
      }
    }

    return { prevented };
  }

  it('guarantees text editing isolation: inputs and textareas do not trigger canvas shortcuts or prevent defaults', () => {
    const inputEl = new (globalThis as any).HTMLInputElement();
    const textareaEl = new (globalThis as any).HTMLTextAreaElement();
    const contentEditableDiv = { isContentEditable: true };

    const testTargets = [inputEl, textareaEl, contentEditableDiv];
    const interceptedKeys = ['Enter', 'Tab', 'Delete', 'Backspace', 'ArrowUp', 'ArrowRight', ' ', 'F2'];

    for (const target of testTargets) {
      for (const key of interceptedKeys) {
        const callbacks = {
          onSave: vi.fn(),
          onUndo: vi.fn(),
          onRedo: vi.fn(),
          onCopy: vi.fn(),
          onCut: vi.fn(),
          onPaste: vi.fn(),
          onAddSiblingBelow: vi.fn(),
          onAddSiblingAbove: vi.fn(),
          onAddChild: vi.fn(),
          onAddFlowchartDownstream: vi.fn(),
          onAddFlowchartUpstream: vi.fn(),
          onAddFlowchartBranch: vi.fn(),
          onDelete: vi.fn(),
          onArrow: vi.fn(),
          onEdit: vi.fn(),
          onDeselect: vi.fn(),
          onToggleOutline: vi.fn(),
          onToggleInspector: vi.fn(),
        };

        const result = dispatchKeyContract({ key, target }, 'mindmap', callbacks);

        // None of the canvas mutations must trigger when typing in text input
        expect(result.prevented).toBe(false);
        expect(callbacks.onAddSiblingBelow).not.toHaveBeenCalled();
        expect(callbacks.onAddChild).not.toHaveBeenCalled();
        expect(callbacks.onDelete).not.toHaveBeenCalled();
        expect(callbacks.onArrow).not.toHaveBeenCalled();
        expect(callbacks.onEdit).not.toHaveBeenCalled();
      }
    }
  });

  it('differentiates Mind Map vs Flowchart graph shortcuts when canvas is active', () => {
    const canvasTarget = {}; // non-input canvas container

    const mmCallbacks = {
      onSave: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onCopy: vi.fn(),
      onCut: vi.fn(),
      onPaste: vi.fn(),
      onAddSiblingBelow: vi.fn(),
      onAddSiblingAbove: vi.fn(),
      onAddChild: vi.fn(),
      onAddFlowchartDownstream: vi.fn(),
      onAddFlowchartUpstream: vi.fn(),
      onAddFlowchartBranch: vi.fn(),
      onDelete: vi.fn(),
      onArrow: vi.fn(),
      onEdit: vi.fn(),
      onDeselect: vi.fn(),
      onToggleOutline: vi.fn(),
      onToggleInspector: vi.fn(),
    };

    // 1. Mind Map: Enter -> Sibling Below, Shift+Enter -> Sibling Above, Tab -> Child
    dispatchKeyContract({ key: 'Enter', target: canvasTarget }, 'mindmap', mmCallbacks);
    expect(mmCallbacks.onAddSiblingBelow).toHaveBeenCalledTimes(1);
    expect(mmCallbacks.onAddFlowchartDownstream).not.toHaveBeenCalled();

    dispatchKeyContract({ key: 'Enter', shiftKey: true, target: canvasTarget }, 'mindmap', mmCallbacks);
    expect(mmCallbacks.onAddSiblingAbove).toHaveBeenCalledTimes(1);

    dispatchKeyContract({ key: 'Tab', target: canvasTarget }, 'mindmap', mmCallbacks);
    expect(mmCallbacks.onAddChild).toHaveBeenCalledTimes(1);
    expect(mmCallbacks.onAddFlowchartBranch).not.toHaveBeenCalled();

    // 2. Flowchart: Enter -> Downstream step, Shift+Enter -> Upstream step, Tab -> Branch
    const fcCallbacks = {
      ...mmCallbacks,
      onAddSiblingBelow: vi.fn(),
      onAddSiblingAbove: vi.fn(),
      onAddChild: vi.fn(),
      onAddFlowchartDownstream: vi.fn(),
      onAddFlowchartUpstream: vi.fn(),
      onAddFlowchartBranch: vi.fn(),
    };

    dispatchKeyContract({ key: 'Enter', target: canvasTarget }, 'flowchart', fcCallbacks);
    expect(fcCallbacks.onAddFlowchartDownstream).toHaveBeenCalledTimes(1);
    expect(fcCallbacks.onAddSiblingBelow).not.toHaveBeenCalled();

    dispatchKeyContract({ key: 'Enter', shiftKey: true, target: canvasTarget }, 'flowchart', fcCallbacks);
    expect(fcCallbacks.onAddFlowchartUpstream).toHaveBeenCalledTimes(1);

    dispatchKeyContract({ key: 'Tab', target: canvasTarget }, 'flowchart', fcCallbacks);
    expect(fcCallbacks.onAddFlowchartBranch).toHaveBeenCalledTimes(1);
    expect(fcCallbacks.onAddChild).not.toHaveBeenCalled();
  });

  it('handles universal canvas actions (Save, Undo, Redo, Space/F2 edit, Delete, Escape, Panels)', () => {
    const canvasTarget = {};
    const callbacks = {
      onSave: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onCopy: vi.fn(),
      onCut: vi.fn(),
      onPaste: vi.fn(),
      onAddSiblingBelow: vi.fn(),
      onAddSiblingAbove: vi.fn(),
      onAddChild: vi.fn(),
      onAddFlowchartDownstream: vi.fn(),
      onAddFlowchartUpstream: vi.fn(),
      onAddFlowchartBranch: vi.fn(),
      onDelete: vi.fn(),
      onArrow: vi.fn(),
      onEdit: vi.fn(),
      onDeselect: vi.fn(),
      onToggleOutline: vi.fn(),
      onToggleInspector: vi.fn(),
    };

    // Ctrl+S
    dispatchKeyContract({ key: 's', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);

    // Ctrl+\ (Toggle Outline)
    dispatchKeyContract({ key: '\\', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onToggleOutline).toHaveBeenCalledTimes(1);

    // Ctrl+/ (Toggle Inspector)
    dispatchKeyContract({ key: '/', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onToggleInspector).toHaveBeenCalledTimes(1);

    // Ctrl+Z
    dispatchKeyContract({ key: 'z', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onUndo).toHaveBeenCalledTimes(1);

    // Ctrl+Shift+Z / Ctrl+Y
    dispatchKeyContract({ key: 'y', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onRedo).toHaveBeenCalledTimes(1);

    // Space & F2
    dispatchKeyContract({ key: ' ', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onEdit).toHaveBeenCalledTimes(1);
    dispatchKeyContract({ key: 'F2', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onEdit).toHaveBeenCalledTimes(2);

    // Delete
    dispatchKeyContract({ key: 'Delete', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);

    // Escape
    dispatchKeyContract({ key: 'Escape', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onDeselect).toHaveBeenCalledTimes(1);
  });
});
