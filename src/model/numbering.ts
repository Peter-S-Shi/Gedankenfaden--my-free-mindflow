import { CanonicalDocument, CanonicalNode, NumberingStyle } from './types';

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
 * Computes presentation numbering badges for all nodes in the document based on hierarchy.
 * Returns a Map from nodeId to presentation badge string (e.g. "1.", "A.", "•").
 */
export function computeDocumentNumbering(doc: CanonicalDocument): Map<string, string> {
  const badgeMap = new Map<string, string>();
  if (doc.mode !== 'mindmap') return badgeMap;

  // Build parent to children map
  const childrenMap = new Map<string, CanonicalNode[]>();
  for (const node of doc.nodes) {
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(node);
      childrenMap.set(node.parentId, list);
    }
  }

  // Find root node(s)
  const rootNodes = doc.nodes.filter((n) => n.type === 'root' || !n.parentId);

  const traverse = (node: CanonicalNode, depth: number, parentRule?: { level1Style?: NumberingStyle; level2Style?: NumberingStyle }) => {
    const children = childrenMap.get(node.id) || [];
    if (children.length === 0) return;

    // Determine numbering style for this level
    const currentRule = node.numbering || parentRule;
    let style: NumberingStyle = 'none';

    if (depth === 0) {
      // Level 1 children (direct children of root)
      style = currentRule?.level1Style || (doc.metadata?.defaultLevel1Numbering as NumberingStyle) || 'decimal';
    } else if (depth === 1) {
      // Level 2 children
      style = currentRule?.level2Style || (doc.metadata?.defaultLevel2Numbering as NumberingStyle) || 'alpha';
    } else {
      // Level 3+
      style = currentRule?.level2Style === 'bullet' ? 'bullet' : 'bullet';
    }

    children.forEach((child, index) => {
      const badge = formatIndexToStyle(index, style);
      if (badge) {
        badgeMap.set(child.id, badge);
      }
      traverse(child, depth + 1, currentRule);
    });
  };

  for (const root of rootNodes) {
    traverse(root, 0);
  }

  return badgeMap;
}
