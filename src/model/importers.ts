/**
 * Gedankenfaden Structured Importers
 * Supports Markdown hierarchical outline and OPML outline import into Canonical Documents
 */

import { CanonicalDocument, CanonicalNode, CanonicalEdge } from './types';
import { getDefaultTheme } from './theme';
import { layoutMindMapDocument } from './layout';

interface ParsedOutlineNode {
  text: string;
  children: ParsedOutlineNode[];
}

/**
 * Imports hierarchical Markdown (headings #, ##, ### and indented lists -, *, 1.) into Canonical Document
 */
export function importFromMarkdown(markdownText: string, defaultTitle?: string): CanonicalDocument {
  const lines = markdownText.split(/\r?\n/);
  const rootChildren: ParsedOutlineNode[] = [];
  let rootTitle = defaultTitle || 'Imported Mind Map';

  interface StackEntry {
    level: number;
    node: ParsedOutlineNode;
  }

  const stack: StackEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check for Markdown headings
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const headingLevel = headingMatch[1].length;
      const text = headingMatch[2].trim();

      if (headingLevel === 1 && rootChildren.length === 0) {
        rootTitle = text;
        continue;
      }

      const newNode: ParsedOutlineNode = { text, children: [] };

      // Find appropriate parent on stack
      while (stack.length > 0 && stack[stack.length - 1].level >= headingLevel) {
        stack.pop();
      }

      if (stack.length === 0) {
        rootChildren.push(newNode);
      } else {
        stack[stack.length - 1].node.children.push(newNode);
      }

      stack.push({ level: headingLevel, node: newNode });
      continue;
    }

    // Check for list items: -, *, +, or 1., 2., etc.
    const listMatch = rawLine.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].replace(/\t/g, '  ').length;
      const listLevel = 10 + Math.floor(indent / 2);
      const text = listMatch[2].trim();

      const newNode: ParsedOutlineNode = { text, children: [] };

      while (stack.length > 0 && stack[stack.length - 1].level >= listLevel) {
        stack.pop();
      }

      if (stack.length === 0) {
        rootChildren.push(newNode);
      } else {
        stack[stack.length - 1].node.children.push(newNode);
      }

      stack.push({ level: listLevel, node: newNode });
      continue;
    }

    // Regular line - if stack has something, append or treat as child
    if (stack.length > 0) {
      const parent = stack[stack.length - 1].node;
      parent.text += ` ${trimmed}`;
    } else {
      rootChildren.push({ text: trimmed, children: [] });
    }
  }

  return convertTreeToCanonical(rootTitle, rootChildren);
}

/**
 * Imports OPML 2.0 Outline into Canonical Document
 */
export function importFromOPML(opmlText: string, defaultTitle?: string): CanonicalDocument {
  let title = defaultTitle;

  // Extract title from <title> tag if present
  const titleMatch = opmlText.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  if (!title) {
    title = 'Imported OPML Map';
  }

  // Parse <outline> tags hierarchically
  const rootChildren: ParsedOutlineNode[] = [];

  function parseOutlines(xmlSnippet: string): ParsedOutlineNode[] {
    const nodes: ParsedOutlineNode[] = [];
    let match: RegExpExecArray | null;
    const regex = /<outline\b([^>]*?)(\/>|>([\s\S]*?)<\/outline>)/gi;

    while ((match = regex.exec(xmlSnippet)) !== null) {
      const attrs = match[1];
      const isSelfClosing = match[2] === '/>';
      const innerContent = match[3] || '';

      // Extract text or _text attribute
      let text = '';
      const textMatch = attrs.match(/\btext="([^"]*)"/i) || attrs.match(/\b_text="([^"]*)"/i);
      if (textMatch) {
        text = decodeXml(textMatch[1]);
      } else {
        const titleAttr = attrs.match(/\btitle="([^"]*)"/i);
        if (titleAttr) text = decodeXml(titleAttr[1]);
      }

      if (!text) text = 'Node';

      const childNodes = isSelfClosing ? [] : parseOutlines(innerContent);
      nodes.push({ text, children: childNodes });
    }

    return nodes;
  }

  const parsed = parseOutlines(opmlText);
  rootChildren.push(...parsed);

  return convertTreeToCanonical(title, rootChildren);
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function convertTreeToCanonical(rootTitle: string, children: ParsedOutlineNode[]): CanonicalDocument {
  const rootId = 'node_root';
  const nodes: CanonicalNode[] = [
    {
      id: rootId,
      text: rootTitle,
      type: 'root',
      geometry: { x: 400, y: 300, width: 160, height: 48 },
      style: {
        backgroundColor: '#2563eb',
        borderColor: '#1d4ed8',
        textColor: '#ffffff',
        borderRadius: 8,
      },
    },
  ];

  const edges: CanonicalEdge[] = [];
  let counter = 1;

  function traverse(parentOutlineNodes: ParsedOutlineNode[], parentId: string) {
    for (const outlineNode of parentOutlineNodes) {
      const nodeId = `node_${counter++}`;
      nodes.push({
        id: nodeId,
        text: outlineNode.text,
        geometry: { x: 0, y: 0, width: 140, height: 40 },
        parentId,
      });

      edges.push({
        id: `edge_${parentId}_${nodeId}`,
        source: parentId,
        target: nodeId,
      });

      if (outlineNode.children.length > 0) {
        traverse(outlineNode.children, nodeId);
      }
    }
  }

  traverse(children, rootId);

  const doc: CanonicalDocument = {
    schemaVersion: '1.0',
    id: `doc_imported_${Date.now()}`,
    title: rootTitle,
    mode: 'mindmap',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: getDefaultTheme('mindmap'),
    nodes,
    edges,
    groups: [],
  };

  // Perform balanced mind map layout
  return layoutMindMapDocument(doc, { preset: 'balanced', horizontalGap: 60, verticalGap: 24 });
}
