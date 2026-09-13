/**
 * PROTOTYPE (M0 Corrective Gate) -- throwaway. Not wired into production.
 *
 * Prototype A with one explicit, bounded exception: when a single parent's
 * DIRECT children exceed `fanoutThreshold`, that parent's children are
 * packed locally with `packChildrenGrid`/`packChildrenRadial`
 * (highFanoutStrategies.ts) instead of the ordinary single-column band.
 * Every other parent in the document still gets ordinary prototype-A
 * placement -- this cannot leak into unrelated siblings or consume their
 * column budget, unlike the old production sqrt-rows patch, because the
 * exception is entirely local to the one pathological parent's own
 * children and doesn't touch `nearEdgeX`/depth bookkeeping for anyone else.
 *
 * Known limitation (acceptable for "smallest viable" per the corrective
 * brief): does not solve further descendants *under* a fanned-out child
 * (the corpus's `01_extreme_star_60.md` fan-out parent's children are all
 * leaves, so this isn't exercised here). A production implementation would
 * need to decide how a grid/radial child's own children re-enter normal
 * banding -- flagged as follow-up, not solved in this prototype.
 */
import { LayoutResult, PositionedEdge, PositionedNode } from './contract';
import { computeTextAwareSize } from './textAwareGeometry';
import { packChildrenGrid, packChildrenRadial } from './highFanoutStrategies';
import {
  ProtoEdgeInput,
  ProtoNodeInput,
  buildChildrenMap,
  computeDepths,
  computeSubtreeFootprintWeights,
  findRoot,
  makeSizeOf,
  partitionBySide,
} from './treeUtils';

export type FanoutStrategy = 'none' | 'grid' | 'radial';

export interface PrototypeAAdaptiveOptions {
  hGap?: number;
  vGap?: number;
  fanoutThreshold?: number;
  fanoutStrategy?: FanoutStrategy;
}

export function layoutPrototypeAAdaptive(
  nodes: ProtoNodeInput[],
  edges: ProtoEdgeInput[],
  options: PrototypeAAdaptiveOptions = {}
): LayoutResult {
  const hGap = options.hGap ?? 60;
  const vGap = options.vGap ?? 24;
  const fanoutThreshold = options.fanoutThreshold ?? 12;
  const fanoutStrategy = options.fanoutStrategy ?? 'none';

  const root = findRoot(nodes);
  const childrenMap = buildChildrenMap(nodes);
  const depths = computeDepths(root, childrenMap);
  const sizes = new Map(nodes.map((n) => [n.id, computeTextAwareSize({ id: n.id, text: n.text })]));
  const sizeOf = makeSizeOf(sizes);
  const reserved = computeSubtreeFootprintWeights(nodes, childrenMap, sizeOf, vGap);

  const bandMaxWidth = new Map<string, number>();
  const nodeSide = new Map<string, 'left' | 'right'>();
  nodeSide.set(root.id, 'right');

  const level1 = childrenMap.get(root.id) || [];
  const { left, right } = partitionBySide(level1, reserved);
  for (const c of left) assignSideRecursive(c, 'left');
  for (const c of right) assignSideRecursive(c, 'right');
  function assignSideRecursive(node: ProtoNodeInput, side: 'left' | 'right') {
    nodeSide.set(node.id, side);
    for (const child of childrenMap.get(node.id) || []) assignSideRecursive(child, side);
  }

  for (const n of nodes) {
    if (n.id === root.id) continue;
    const side = nodeSide.get(n.id) || 'right';
    const depth = depths.get(n.id)!;
    const key = `${side}:${depth}`;
    bandMaxWidth.set(key, Math.max(bandMaxWidth.get(key) || 0, sizeOf(n.id).width));
  }

  function nearEdgeX(side: 'left' | 'right', depth: number, rootSize: { width: number }): number {
    let x = side === 'right' ? rootSize.width / 2 + hGap : -rootSize.width / 2 - hGap;
    for (let d = 1; d < depth; d++) {
      const bandWidth = bandMaxWidth.get(`${side}:${d}`) || 150;
      x += side === 'right' ? bandWidth + hGap : -(bandWidth + hGap);
    }
    return x;
  }

  const collapsedIds = new Set(nodes.filter((n) => n.collapsed).map((n) => n.id));
  function isCollapsed(id: string) {
    return collapsedIds.has(id);
  }

  const positioned = new Map<string, PositionedNode>();
  const rootSize = sizeOf(root.id);
  positioned.set(root.id, {
    id: root.id,
    parentId: undefined,
    depth: 0,
    x: -rootSize.width / 2,
    y: -rootSize.height / 2,
    width: rootSize.width,
    height: rootSize.height,
  });

  function placeChildren(parentId: string, parentCenterY: number, side: 'left' | 'right', depth: number) {
    if (isCollapsed(parentId)) return;
    const children = (childrenMap.get(parentId) || []).filter((c) => nodeSide.get(c.id) === side);
    if (children.length === 0) return;

    if (fanoutStrategy !== 'none' && children.length > fanoutThreshold) {
      const packed =
        fanoutStrategy === 'grid'
          ? packChildrenGrid(children, sizeOf, hGap, vGap, side)
          : packChildrenRadial(children, sizeOf, hGap, vGap);
      const parent = [...positioned.values()].find((p) => p.id === parentId)!;
      const parentCenterX = parent.x + parent.width / 2;
      for (const child of children) {
        const rel = packed.get(child.id)!;
        positioned.set(child.id, {
          id: child.id,
          parentId,
          depth,
          x: parentCenterX + rel.x,
          y: parentCenterY + rel.y,
          width: rel.width,
          height: rel.height,
        });
        // Known limitation: grandchildren of a grid/radial-packed node are
        // not addressed by this prototype (see file header) -- not
        // exercised by the corpus's leaf-only fan-out fixture.
      }
      return;
    }

    const totalHeight =
      children.reduce((sum, c) => sum + (reserved.get(c.id) ?? sizeOf(c.id).height), 0) + vGap * (children.length - 1);
    let cursorY = parentCenterY - totalHeight / 2;

    for (const child of children) {
      const h = reserved.get(child.id) ?? sizeOf(child.id).height;
      const childCenterY = cursorY + h / 2;
      const size = sizeOf(child.id);
      const near = nearEdgeX(side, depth, rootSize);
      const x = side === 'right' ? near : near - size.width;

      positioned.set(child.id, {
        id: child.id,
        parentId,
        depth,
        x,
        y: childCenterY - size.height / 2,
        width: size.width,
        height: size.height,
      });

      placeChildren(child.id, childCenterY, side, depth + 1);
      cursorY += h + vGap;
    }
  }

  placeChildren(root.id, positioned.get(root.id)!.y + rootSize.height / 2, 'right', 1);
  placeChildren(root.id, positioned.get(root.id)!.y + rootSize.height / 2, 'left', 1);

  const resultNodes: PositionedNode[] = nodes.map((n) => positioned.get(n.id)!).filter(Boolean);
  const resultEdges: PositionedEdge[] = edges.map((e) => ({ source: e.source, target: e.target }));

  return { nodes: resultNodes, edges: resultEdges };
}
