import { CanonicalNode, CanonicalEdge } from './types';

export interface ParsedSubtree {
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
}

/**
 * Parses multiline indented text or bullet lists into a hierarchical subtree
 * and connects it to the specified target parent node.
 */
export function parseMultilineToTree(
  rawText: string,
  targetParentId: string,
  baseGeometry: { x: number; y: number } = { x: 400, y: 300 }
): ParsedSubtree {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const nodes: CanonicalNode[] = [];
  const edges: CanonicalEdge[] = [];

  // Parse lines with indentation level and cleaned content
  const parsedLines: { depth: number; text: string }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Count indentation: tabs = 1 depth, or 2/4 spaces = 1 depth
    const leadingWhitespaceMatch = line.match(/^([ \t]*)/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[1] : '';

    let depth = 0;
    for (let i = 0; i < leadingWhitespace.length; i++) {
      if (leadingWhitespace[i] === '\t') {
        depth += 1;
      } else if (leadingWhitespace[i] === ' ') {
        // Assume 2 or 4 spaces per indent level
        let spaceCount = 1;
        while (i + 1 < leadingWhitespace.length && leadingWhitespace[i + 1] === ' ') {
          spaceCount++;
          i++;
        }
        depth += Math.max(1, Math.round(spaceCount / 2));
      }
    }

    // Strip bullet markers (- , * , + , 1. , a. , etc.)
    const trimmed = line.trim();
    const cleanText = trimmed
      .replace(/^([-*+•▪◦‣]\s+|\d+[.)]\s+|[a-zA-Z][.)]\s+|[ivxIVX]+[.)]\s+)/, '')
      .trim();

    if (cleanText) {
      parsedLines.push({ depth, text: cleanText });
    }
  }

  if (parsedLines.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Normalize depth so the minimum depth is 0
  const minDepth = Math.min(...parsedLines.map((l) => l.depth));
  const normalizedLines = parsedLines.map((l) => ({
    depth: l.depth - minDepth,
    text: l.text,
  }));

  // Build tree hierarchy using a depth stack
  const stack: { depth: number; nodeId: string }[] = [
    { depth: -1, nodeId: targetParentId },
  ];

  const now = Date.now();
  let counter = 0;

  normalizedLines.forEach((item) => {
    while (stack.length > 1 && stack[stack.length - 1].depth >= item.depth) {
      stack.pop();
    }

    const parentId = stack[stack.length - 1].nodeId;
    const nodeId = `node_paste_${now}_${++counter}`;

    const newNode: CanonicalNode = {
      id: nodeId,
      text: item.text,
      geometry: {
        x: baseGeometry.x + (item.depth + 1) * 180,
        y: baseGeometry.y + counter * 50,
        width: 150,
        height: 44,
      },
      type: 'default',
      parentId,
    };

    const newEdge: CanonicalEdge = {
      id: `edge_paste_${now}_${counter}`,
      source: parentId,
      target: nodeId,
      type: 'smoothstep',
    };

    nodes.push(newNode);
    edges.push(newEdge);

    stack.push({ depth: item.depth, nodeId });
  });

  return { nodes, edges };
}
