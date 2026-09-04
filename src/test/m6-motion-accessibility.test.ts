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
});
