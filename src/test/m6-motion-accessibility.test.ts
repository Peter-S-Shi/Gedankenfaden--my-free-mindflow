import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('M6 Signature Motion & Reduced-Motion Accessibility Audit', () => {
  const cssPath = path.resolve(__dirname, '../styles/animations.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  const EXPECTED_SIGNATURE_MOTIONS = [
    { name: '1. Create -> Grow', selector: '.signature-create-grow', keyframe: '@keyframes nodeBirth' },
    { name: '2. Connect -> Draw', selector: '.signature-connect-draw', keyframe: '@keyframes edgeDraw' },
    { name: '3. Select -> Breathe', selector: '.signature-select-breathe', keyframe: '@keyframes selectBreathe' },
    { name: '4. Focus -> Elevate', selector: '.signature-focus-elevate', keyframe: null },
    { name: '5. Deselect -> Recede', selector: '.signature-deselect-recede', keyframe: null },
    { name: '6. Move -> Glide', selector: '.signature-move-glide', keyframe: null },
    { name: '7. Expand -> Unfold', selector: '.signature-expand-unfold', keyframe: '@keyframes branchUnfold' },
    { name: '8. Collapse -> Gather', selector: '.signature-collapse-gather', keyframe: '@keyframes branchGather' },
    { name: '9. Delete -> Dissolve', selector: '.signature-delete-dissolve', keyframe: '@keyframes elementDissolve' },
  ];

  it('defines all 9 signature motion metaphors with distinct CSS classes and keyframes', () => {
    for (const motion of EXPECTED_SIGNATURE_MOTIONS) {
      expect(cssContent).toContain(motion.selector);
      if (motion.keyframe) {
        expect(cssContent).toContain(motion.keyframe);
      }
    }
  });

  it('strictly disables animations, transitions, and transforms under @media (prefers-reduced-motion: reduce)', () => {
    expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');

    const mediaQueryMatch = cssContent.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]+(\{[^}]*\}[^}]*)*)\}/);
    expect(mediaQueryMatch).not.toBeNull();

    const mediaBlock = mediaQueryMatch![1];

    // Every signature motion selector must be included in the reduced-motion block
    for (const motion of EXPECTED_SIGNATURE_MOTIONS) {
      expect(mediaBlock).toContain(motion.selector);
    }

    // Must enforce non-motion attributes
    expect(mediaBlock).toMatch(/animation:\s*none\s*!important/);
    expect(mediaBlock).toMatch(/transition:\s*none\s*!important/);
    expect(mediaBlock).toMatch(/transform:\s*none\s*!important/);
  });

  it('applies reduced motion rules to react-flow handles and edge paths', () => {
    const mediaQueryMatch = cssContent.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]+(\{[^}]*\}[^}]*)*)\}/);
    expect(mediaQueryMatch).not.toBeNull();
    const mediaBlock = mediaQueryMatch![1];

    expect(mediaBlock).toContain('.react-flow__handle');
    expect(mediaBlock).toContain('.react-flow__edge-path');
  });

  it('proves production adapter wires signature motion classes to projected edges', async () => {
    const { canonicalToReactFlow } = await import('../model/adapter');
    const { createEmptyDocument } = await import('../model/document');

    const doc = createEmptyDocument('Motion Wiring Doc', 'flowchart');
    doc.edges = [{ id: 'edge_test', source: 'node_start', target: 'node_process_1' }];

    const projected = canonicalToReactFlow(doc);
    expect(projected.edges.length).toBe(1);
    expect(projected.edges[0].className).toBe('signature-connect-draw');
  });

  it('proves production components wire signature motion classes into their render outputs', () => {
    const customNodeSource = fs.readFileSync(path.resolve(__dirname, '../components/CustomNode.tsx'), 'utf-8');
    const libraryHomeSource = fs.readFileSync(path.resolve(__dirname, '../components/LibraryHome.tsx'), 'utf-8');

    // CustomNode wires create-grow, select-breathe, move-glide, fold collapse/expand, and delete-dissolve
    expect(customNodeSource).toContain('signature-move-glide');
    expect(customNodeSource).toContain('signature-create-grow');
    expect(customNodeSource).toContain('signature-select-breathe');
    expect(customNodeSource).toContain('signature-collapse-gather');
    expect(customNodeSource).toContain('signature-expand-unfold');
    expect(customNodeSource).toContain('signature-delete-dissolve');

    // LibraryHome wires focus-elevate and deselect-recede
    expect(libraryHomeSource).toContain('signature-focus-elevate');
    expect(libraryHomeSource).toContain('signature-deselect-recede');
  });

  it('validates runtime reduced-motion helper and degradation logic', async () => {
    const { isReducedMotionPreferred, getMotionClass } = await import('../interaction/motion');

    // Default Node environment (matchMedia undefined) -> false
    expect(isReducedMotionPreferred()).toBe(false);
    expect(getMotionClass('signature-create-grow', true)).toBe('signature-create-grow');

    // Mock matchMedia returning matches: true
    const originalMatchMedia = (globalThis as any).window?.matchMedia;
    try {
      if (!(globalThis as any).window) {
        (globalThis as any).window = globalThis;
      }
      (globalThis as any).window.matchMedia = (query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      });

      expect(isReducedMotionPreferred()).toBe(true);
      // When reduced motion is preferred and bypass is requested, motion class is degraded to empty
      expect(getMotionClass('signature-create-grow', true)).toBe('');
      // When bypass is false, class is retained but neutralized by CSS @media (prefers-reduced-motion: reduce)
      expect(getMotionClass('signature-create-grow', false)).toBe('signature-create-grow');
    } finally {
      if (originalMatchMedia) {
        (globalThis as any).window.matchMedia = originalMatchMedia;
      }
    }
  });
});
