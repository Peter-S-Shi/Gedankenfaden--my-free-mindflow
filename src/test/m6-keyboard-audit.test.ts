import { describe, it, expect, vi } from 'vitest';
import {
  dispatchCanvasKeyDown,
  isTextInputElement,
  CanvasKeyboardCallbacks,
} from '../interaction/keyboardDispatcher';

// Ensure standard DOM classes exist in Node environment
if (typeof (globalThis as any).HTMLInputElement === 'undefined') {
  (globalThis as any).HTMLInputElement = class HTMLInputElement {};
}
if (typeof (globalThis as any).HTMLTextAreaElement === 'undefined') {
  (globalThis as any).HTMLTextAreaElement = class HTMLTextAreaElement {};
}
if (typeof (globalThis as any).HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = class HTMLElement {};
}

describe('M6 Production-Path Keyboard Dispatcher & Text Isolation Audit', () => {
  it('correctly identifies text inputs, textareas, and contenteditable elements via isTextInputElement', () => {
    const inputEl = new (globalThis as any).HTMLInputElement();
    const textareaEl = new (globalThis as any).HTMLTextAreaElement();
    const contentEditableDiv = { isContentEditable: true };
    const contentEditableAttr = { getAttribute: (attr: string) => (attr === 'contenteditable' ? 'true' : null) };
    const plainCanvasDiv = { isContentEditable: false };

    expect(isTextInputElement(inputEl)).toBe(true);
    expect(isTextInputElement(textareaEl)).toBe(true);
    expect(isTextInputElement(contentEditableDiv)).toBe(true);
    expect(isTextInputElement(contentEditableAttr)).toBe(true);
    expect(isTextInputElement(plainCanvasDiv)).toBe(false);
    expect(isTextInputElement(null)).toBe(false);
  });

  it('guarantees text editing isolation: inputs and textareas do not trigger canvas shortcuts or prevent defaults', () => {
    const inputEl = new (globalThis as any).HTMLInputElement();
    const textareaEl = new (globalThis as any).HTMLTextAreaElement();
    const contentEditableDiv = { isContentEditable: true };

    const testTargets = [inputEl, textareaEl, contentEditableDiv];
    const interceptedKeys = ['Enter', 'Tab', 'Delete', 'Backspace', 'ArrowUp', 'ArrowRight', ' ', 'F2', 'z', 'y', 'c', 'x', 'v'];

    for (const target of testTargets) {
      for (const key of interceptedKeys) {
        let prevented = false;
        const fakeEvent = {
          key,
          ctrlKey: ['z', 'y', 'c', 'x', 'v'].includes(key),
          shiftKey: false,
          target,
          preventDefault: () => {
            prevented = true;
          },
        };

        const callbacks: CanvasKeyboardCallbacks = {
          onSave: vi.fn(),
          onSearch: vi.fn(),
          onToggleOutline: vi.fn(),
          onToggleInspector: vi.fn(),
          onUndo: vi.fn(),
          onRedo: vi.fn(),
          onCopy: vi.fn(),
          onCut: vi.fn(),
          onPaste: vi.fn(),
          onEditSelectedNode: vi.fn(),
          onAddSiblingBelow: vi.fn(),
          onAddSiblingAbove: vi.fn(),
          onAddChild: vi.fn(),
          onAddFlowchartDownstream: vi.fn(),
          onAddFlowchartUpstream: vi.fn(),
          onAddFlowchartBranch: vi.fn(),
          onDeleteSelected: vi.fn(),
          onArrowNavigation: vi.fn(),
          onDeselect: vi.fn(),
        };

        const handled = dispatchCanvasKeyDown(fakeEvent, 'mindmap', callbacks);

        // Crucial verification: production dispatcher refuses to intercept keystrokes when editing text
        expect(handled).toBe(false);
        expect(prevented).toBe(false);
        expect(callbacks.onAddSiblingBelow).not.toHaveBeenCalled();
        expect(callbacks.onAddChild).not.toHaveBeenCalled();
        expect(callbacks.onDeleteSelected).not.toHaveBeenCalled();
        expect(callbacks.onUndo).not.toHaveBeenCalled();
        expect(callbacks.onRedo).not.toHaveBeenCalled();
        expect(callbacks.onCopy).not.toHaveBeenCalled();
      }
    }
  });

  it('differentiates Mind Map vs Flowchart graph shortcuts on canvas target in production module', () => {
    const canvasTarget = { isContentEditable: false };

    const mmCallbacks: CanvasKeyboardCallbacks = {
      onSave: vi.fn(),
      onSearch: vi.fn(),
      onToggleOutline: vi.fn(),
      onToggleInspector: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onCopy: vi.fn(),
      onCut: vi.fn(),
      onPaste: vi.fn(),
      onEditSelectedNode: vi.fn(),
      onAddSiblingBelow: vi.fn(),
      onAddSiblingAbove: vi.fn(),
      onAddChild: vi.fn(),
      onAddFlowchartDownstream: vi.fn(),
      onAddFlowchartUpstream: vi.fn(),
      onAddFlowchartBranch: vi.fn(),
      onDeleteSelected: vi.fn(),
      onArrowNavigation: vi.fn(),
      onDeselect: vi.fn(),
    };

    // 1. Mind Map: Enter -> Sibling Below, Shift+Enter -> Sibling Above, Tab -> Child
    let prevented = false;
    let handled = dispatchCanvasKeyDown(
      { key: 'Enter', target: canvasTarget, preventDefault: () => { prevented = true; } },
      'mindmap',
      mmCallbacks
    );
    expect(handled).toBe(true);
    expect(prevented).toBe(true);
    expect(mmCallbacks.onAddSiblingBelow).toHaveBeenCalledTimes(1);
    expect(mmCallbacks.onAddFlowchartDownstream).not.toHaveBeenCalled();

    dispatchCanvasKeyDown(
      { key: 'Enter', shiftKey: true, target: canvasTarget },
      'mindmap',
      mmCallbacks
    );
    expect(mmCallbacks.onAddSiblingAbove).toHaveBeenCalledTimes(1);

    dispatchCanvasKeyDown(
      { key: 'Tab', target: canvasTarget },
      'mindmap',
      mmCallbacks
    );
    expect(mmCallbacks.onAddChild).toHaveBeenCalledTimes(1);
    expect(mmCallbacks.onAddFlowchartBranch).not.toHaveBeenCalled();

    // 2. Flowchart: Enter -> Downstream step, Shift+Enter -> Upstream step, Tab -> Branch
    const fcCallbacks: CanvasKeyboardCallbacks = {
      ...mmCallbacks,
      onAddSiblingBelow: vi.fn(),
      onAddSiblingAbove: vi.fn(),
      onAddChild: vi.fn(),
      onAddFlowchartDownstream: vi.fn(),
      onAddFlowchartUpstream: vi.fn(),
      onAddFlowchartBranch: vi.fn(),
    };

    handled = dispatchCanvasKeyDown(
      { key: 'Enter', target: canvasTarget },
      'flowchart',
      fcCallbacks
    );
    expect(handled).toBe(true);
    expect(fcCallbacks.onAddFlowchartDownstream).toHaveBeenCalledTimes(1);
    expect(fcCallbacks.onAddSiblingBelow).not.toHaveBeenCalled();

    dispatchCanvasKeyDown(
      { key: 'Enter', shiftKey: true, target: canvasTarget },
      'flowchart',
      fcCallbacks
    );
    expect(fcCallbacks.onAddFlowchartUpstream).toHaveBeenCalledTimes(1);

    dispatchCanvasKeyDown(
      { key: 'Tab', target: canvasTarget },
      'flowchart',
      fcCallbacks
    );
    expect(fcCallbacks.onAddFlowchartBranch).toHaveBeenCalledTimes(1);
    expect(fcCallbacks.onAddChild).not.toHaveBeenCalled();
  });

  it('handles universal canvas actions (Save, Panels, Undo, Redo, Edit, Delete, Escape) via production dispatcher', () => {
    const canvasTarget = { isContentEditable: false };
    const callbacks: CanvasKeyboardCallbacks = {
      onSave: vi.fn(),
      onSearch: vi.fn(),
      onToggleOutline: vi.fn(),
      onToggleInspector: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onCopy: vi.fn(),
      onCut: vi.fn(),
      onPaste: vi.fn(),
      onEditSelectedNode: vi.fn(),
      onAddSiblingBelow: vi.fn(),
      onAddSiblingAbove: vi.fn(),
      onAddChild: vi.fn(),
      onAddFlowchartDownstream: vi.fn(),
      onAddFlowchartUpstream: vi.fn(),
      onAddFlowchartBranch: vi.fn(),
      onDeleteSelected: vi.fn(),
      onArrowNavigation: vi.fn(),
      onDeselect: vi.fn(),
    };

    // Ctrl+S: Save
    let handled = dispatchCanvasKeyDown({ key: 's', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(handled).toBe(true);
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);

    // Ctrl+F: Search
    handled = dispatchCanvasKeyDown({ key: 'f', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(handled).toBe(true);
    expect(callbacks.onSearch).toHaveBeenCalledTimes(1);

    // Ctrl+\: Toggle Outline
    handled = dispatchCanvasKeyDown({ key: '\\', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(handled).toBe(true);
    expect(callbacks.onToggleOutline).toHaveBeenCalledTimes(1);

    // Ctrl+/: Toggle Inspector
    handled = dispatchCanvasKeyDown({ key: '/', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(handled).toBe(true);
    expect(callbacks.onToggleInspector).toHaveBeenCalledTimes(1);

    // Ctrl+Z: Undo
    handled = dispatchCanvasKeyDown({ key: 'z', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(handled).toBe(true);
    expect(callbacks.onUndo).toHaveBeenCalledTimes(1);

    // Ctrl+Y: Redo
    handled = dispatchCanvasKeyDown({ key: 'y', ctrlKey: true, target: canvasTarget }, 'mindmap', callbacks);
    expect(handled).toBe(true);
    expect(callbacks.onRedo).toHaveBeenCalledTimes(1);

    // Space & F2: Edit selected node
    dispatchCanvasKeyDown({ key: ' ', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onEditSelectedNode).toHaveBeenCalledTimes(1);

    dispatchCanvasKeyDown({ key: 'F2', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onEditSelectedNode).toHaveBeenCalledTimes(2);

    // Delete
    dispatchCanvasKeyDown({ key: 'Delete', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onDeleteSelected).toHaveBeenCalledTimes(1);

    // Escape
    dispatchCanvasKeyDown({ key: 'Escape', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onDeselect).toHaveBeenCalledTimes(1);

    // Arrow keys
    dispatchCanvasKeyDown({ key: 'ArrowDown', target: canvasTarget }, 'mindmap', callbacks);
    expect(callbacks.onArrowNavigation).toHaveBeenCalledWith('ArrowDown');
  });
});
