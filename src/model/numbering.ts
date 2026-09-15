import { CanonicalDocument, CanonicalNode, NodeNumberingRule, NumberingStyle } from './types';

export function formatIndexToStyle(index: number, style: NumberingStyle): string {
  if (style === 'none') return '';

  switch (style) {
    case 'decimal':
      return `${index + 1}.`;

    case 'alpha': {
      // 0 -> A, 1 -> B ... 25 -> Z, 26 -> AA
      let result = '';
      let n = index;
      while (n >= 0) {
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26) - 1;
      }
      return `${result}.`;
    }

    case 'roman': {
      const romanNumerals = [
        { value: 1000, numeral: 'M' },
        { value: 900, numeral: 'CM' },
        { value: 500, numeral: 'D' },
        { value: 400, numeral: 'CD' },
        { value: 100, numeral: 'C' },
        { value: 90, numeral: 'XC' },
        { value: 50, numeral: 'L' },
        { value: 40, numeral: 'XL' },
        { value: 10, numeral: 'X' },
        { value: 9, numeral: 'IX' },
        { value: 5, numeral: 'V' },
        { value: 4, numeral: 'IV' },
        { value: 1, numeral: 'I' },
      ];
      let num = index + 1;
      let roman = '';
      for (const { value, numeral } of romanNumerals) {
        while (num >= value) {
          roman += numeral;
          num -= value;
        }
      }
      return `${roman}.`;
    }

    case 'bullet': {
      const bullets = ['•', '▪', '◦', '‣'];
      return bullets[index % bullets.length];
    }

    default:
      return '';
  }
}

/**
 * Computes presentation numbering badges for all nodes in the document based
 * on hierarchy. Returns a Map from nodeId to presentation badge string
 * (e.g. "1.", "A.", "•").
 *
 * M3 Behavior Correction Contract: numbering has no ambient default --
 * nothing is numbered unless some node's `numbering` rule was explicitly
 * applied (via `canApplyNumbering`-gated UI). A rule is parent-scoped: it
 * governs the node's own direct children (and further descendants, up to
 * `maxDepth`) using a depth counted *relative to the node that owns the
 * rule*, not the document root -- so applying a rule to a node deep in the
 * tree numbers exactly "1, 2, 3..." for its own children, the same as
 * applying it at the root. A descendant with its own `numbering` rule
 * overrides the inherited one for its own subtree.
 */
export function computeDocumentNumbering(doc: CanonicalDocument): Map<string, string> {
  const badgeMap = new Map<string, string>();
  if (doc.mode !== 'mindmap') return badgeMap;

  const childrenMap = new Map<string, CanonicalNode[]>();
  for (const node of doc.nodes) {
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(node);
      childrenMap.set(node.parentId, list);
    }
  }

  const rootNodes = doc.nodes.filter((n) => n.type === 'root' || !n.parentId);

  /**
   * `relativeDepth` counts down from whichever node most recently declared
   * its own `numbering` rule (0 = that owner's direct children). It resets
   * to 0 the moment a node with its own rule is visited, so a deeper
   * override always starts a fresh "1, 2, 3..." for its own children.
   */
  const traverse = (node: CanonicalNode, relativeDepth: number, inheritedRule?: NodeNumberingRule) => {
    const children = childrenMap.get(node.id) || [];
    if (children.length === 0) return;

    const ownRule = node.numbering;
    const rule = ownRule || inheritedRule;
    const depth = ownRule ? 0 : relativeDepth;

    if (!rule) {
      // No rule anywhere in this node's ancestor chain -- no numbering here,
      // but keep walking in case a deeper node declares its own rule.
      children.forEach((child) => traverse(child, 0, undefined));
      return;
    }

    if (rule.maxDepth !== undefined && depth >= rule.maxDepth) {
      children.forEach((child) => traverse(child, depth + 1, rule));
      return;
    }

    let style: NumberingStyle;
    if (depth === 0) {
      style = rule.level1Style || 'none';
    } else if (depth === 1) {
      style = rule.level2Style || rule.level1Style || 'none';
    } else {
      style = rule.level1Style && rule.level1Style !== 'none' ? 'bullet' : 'none';
    }

    children.forEach((child, index) => {
      const badge = formatIndexToStyle(index, style);
      if (badge) {
        badgeMap.set(child.id, badge);
      }
      traverse(child, depth + 1, rule);
    });
  };

  for (const root of rootNodes) {
    traverse(root, 0, undefined);
  }

  return badgeMap;
}

/**
 * Whether the Numbering menu should be enabled for `nodeId`: Mind Map mode
 * only, and only when the node actually has children to number (contract:
 * "if the selected node has no children, the Numbering menu must be
 * disabled/greyed out").
 */
export function canApplyNumbering(doc: CanonicalDocument, nodeId: string | null | undefined): boolean {
  if (doc.mode !== 'mindmap' || !nodeId) return false;
  return doc.nodes.some((n) => n.parentId === nodeId);
}

/**
 * Inline presentation string for a node's label (contract: numbering renders
 * as an ordinary text prefix -- "1. 核心主角" -- not a separate badge/pill).
 */
export function formatNumberedLabel(badge: string | undefined, text: string): string {
  return badge ? `${badge} ${text}` : text;
}
