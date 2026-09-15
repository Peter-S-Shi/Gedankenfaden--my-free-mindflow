/**
 * Ticket #8 (F07) reopened: real-user acceptance evidence on complex real
 * samples showed exported SVG/HTML/PNG diagrams collapsing long node text
 * into a single unwrapped line inside the node's small declared box --
 * producing overlapping/overflowing, crowded diagrams that do not match
 * what the in-product canvas shows (long text wraps and the node grows).
 */
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToSVG } from '../export/exporter';

function rectFromSvg(svg: string, nodeId: string): { x: number; y: number; width: number; height: number } {
  const groupMatch = svg.match(new RegExp(`<g id="${nodeId}"[^>]*>([^]*?)</g>`));
  expect(groupMatch).not.toBeNull();
  const rectMatch = groupMatch![1].match(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/);
  expect(rectMatch).not.toBeNull();
  return {
    x: parseFloat(rectMatch![1]),
    y: parseFloat(rectMatch![2]),
    width: parseFloat(rectMatch![3]),
    height: parseFloat(rectMatch![4]),
  };
}

describe('F07 export preserves long node text as wrapped, non-overflowing content', () => {
  it('wraps a long Chinese sentence into multiple <tspan> lines instead of one overflowing line', () => {
    const doc = createEmptyDocument('Long text export', 'mindmap');
    const longText = '这是一段用来测试节点自动换行与自动增高逻辑的很长的中文示例句子文本';
    doc.nodes = [
      { id: 'root', text: 'Root', type: 'root', geometry: { x: 0, y: 0, width: 160, height: 48 } },
      { id: 'n1', text: longText, geometry: { x: 300, y: 0, width: 150, height: 44 }, parentId: 'root' },
    ];
    doc.edges = [{ id: 'e1', source: 'root', target: 'n1' }];

    const svg = exportToSVG(doc);
    const groupMatch = svg.match(/<g id="n1"[^>]*>([\s\S]*?)<\/g>/);
    expect(groupMatch).not.toBeNull();

    const tspans = [...groupMatch![1].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    // A ~30-character Chinese sentence cannot fit on one line inside a
    // 150px-wide box at 14px font size -- it must wrap into several lines.
    expect(tspans.length).toBeGreaterThan(1);

    // The full text must be preserved across the wrapped lines (nothing
    // silently truncated or dropped).
    expect(tspans.join('')).toBe(longText);

    // The node's rendered rect must have grown tall enough to contain every
    // wrapped line -- not stay pinned at the tiny declared 44px height.
    const rect = rectFromSvg(svg, 'n1');
    expect(rect.height).toBeGreaterThan(44);
  });

  it('does not wrap or grow short text that already fits on one line', () => {
    const doc = createEmptyDocument('Short text export', 'mindmap');
    doc.nodes = [
      { id: 'root', text: 'Root', type: 'root', geometry: { x: 0, y: 0, width: 160, height: 48 } },
      { id: 'n1', text: 'OK', geometry: { x: 300, y: 0, width: 150, height: 44 }, parentId: 'root' },
    ];
    doc.edges = [{ id: 'e1', source: 'root', target: 'n1' }];

    const svg = exportToSVG(doc);
    const rect = rectFromSvg(svg, 'n1');
    expect(rect.height).toBe(44);

    const groupMatch = svg.match(/<g id="n1"[^>]*>([\s\S]*?)<\/g>/);
    const tspans = [...groupMatch![1].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)];
    expect(tspans.length).toBe(1);
    expect(tspans[0][1]).toBe('OK');
  });

  it('keeps edge anchors consistent with the grown node box, not the stale declared geometry', () => {
    const doc = createEmptyDocument('Anchor consistency', 'mindmap');
    const longText = '这是一段足够长的中文文本用来触发节点自动增高的换行逻辑测试';
    doc.nodes = [
      { id: 'root', text: 'Root', type: 'root', geometry: { x: 0, y: 0, width: 160, height: 48 } },
      { id: 'n1', text: longText, geometry: { x: 300, y: 100, width: 150, height: 44 }, parentId: 'root' },
    ];
    doc.edges = [{ id: 'e1', source: 'root', target: 'n1', sourceHandle: 'right', targetHandle: 'left' }];

    const svg = exportToSVG(doc);
    const rect = rectFromSvg(svg, 'n1');
    const expectedAnchorY = rect.y + rect.height / 2;

    const pathMatch = svg.match(/<path data-edge-id="e1"[^>]*\sd="([^"]+)"/);
    expect(pathMatch).not.toBeNull();
    // Path starts at the root's own right-handle anchor and ends at n1's
    // left-handle anchor -- the final coordinate pair is the target anchor.
    const nums = pathMatch![1].match(/-?\d+(\.\d+)?/g)!.map(Number);
    const endX = nums[nums.length - 2];
    const endY = nums[nums.length - 1];
    expect(endX).toBeCloseTo(rect.x, 1);
    expect(endY).toBeCloseTo(expectedAnchorY, 1);
  });
});
