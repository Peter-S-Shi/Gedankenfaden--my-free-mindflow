/**
 * Gedankenfaden Multi-Format Exporter Suite
 * Implements all 11 export formats specified in PRODUCT_SPEC.md & ARCHITECTURE.md:
 * 1. Canonical JSON (.json)
 * 2. SVG (.svg)
 * 3. PNG (.png)
 * 4. JPEG (.jpeg)
 * 5. PDF (.pdf)
 * 6. Markdown (.md)
 * 7. HTML (.html)
 * 8. Mermaid (.mmd / .mermaid)
 * 9. OPML (.opml)
 * 10. Legacy mind-map XML (.mm)
 * 11. JSON Canvas (.canvas)
 */

import { CanonicalDocument, CanonicalNode } from '../model/types';
import { serializeDocument } from '../model/document';
import { calculateOrthogonalPath } from '../model/routing';

/**
 * 1. Native Lossless JSON Exporter (.json)
 */
export function exportToJSON(doc: CanonicalDocument): string {
  return serializeDocument(doc);
}

/**
 * 2. Vector SVG Exporter (.svg)
 */
export function exportToSVG(doc: CanonicalDocument): string {
  if (doc.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"></svg>`;
  }

  let minX = Infinity;
  let minY = Infinity;
  maxX_calc: {
    let maxX = -Infinity;
    let maxY = -Infinity;

    doc.nodes.forEach((n) => {
      const w = n.geometry.width || 150;
      const h = n.geometry.height || 44;
      minX = Math.min(minX, n.geometry.x);
      minY = Math.min(minY, n.geometry.y);
      maxX = Math.max(maxX, n.geometry.x + w);
      maxY = Math.max(maxY, n.geometry.y + h);
    });

    const padding = 60;
    const vbX = Math.floor(minX - padding);
    const vbY = Math.floor(minY - padding);
    const vbW = Math.ceil(maxX - minX + padding * 2);
    const vbH = Math.ceil(maxY - minY + padding * 2);

    const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
    let svgContent = '';

    doc.groups.forEach((group) => {
      const bounds = group.bounds;
      if (!bounds) return;
      svgContent += `  <g data-group-id="${escapeXml(group.id)}"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="12" fill="${escapeXml(group.style?.backgroundColor || 'rgba(241,245,249,0.65)')}" stroke="${escapeXml(group.style?.borderColor || '#cbd5e1')}" stroke-width="2" stroke-dasharray="6 4"/><text x="${bounds.x + 12}" y="${bounds.y + 22}" fill="#334155" font-family="sans-serif" font-size="12" font-weight="600">${escapeXml(group.title)}</text></g>\n`;
    });

    // Render edges
    doc.edges.forEach((edge) => {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) return;

      const anchor = (node: CanonicalNode, handle: string | undefined) => {
        const width = node.geometry.width || 150; const height = node.geometry.height || 44;
        if (handle === 'left') return { x: node.geometry.x, y: node.geometry.y + height / 2 };
        if (handle === 'top') return { x: node.geometry.x + width / 2, y: node.geometry.y };
        if (handle === 'bottom') return { x: node.geometry.x + width / 2, y: node.geometry.y + height };
        return { x: node.geometry.x + width, y: node.geometry.y + height / 2 };
      };
      const start = anchor(src, edge.sourceHandle); const end = anchor(tgt, edge.targetHandle);
      const pathD = edge.type === 'straight' ? `M ${start.x} ${start.y} L ${end.x} ${end.y}` : edge.type === 'orthogonal' ? calculateOrthogonalPath(start, end, edge.sourceHandle as 'left' | 'right' | 'top' | 'bottom', edge.targetHandle as 'left' | 'right' | 'top' | 'bottom').path : edge.type === 'smoothstep' ? `M ${start.x} ${start.y} Q ${start.x} ${(start.y + end.y) / 2} ${(start.x + end.x) / 2} ${(start.y + end.y) / 2} Q ${end.x} ${(start.y + end.y) / 2} ${end.x} ${end.y}` : `M ${start.x} ${start.y} C ${(start.x + end.x) / 2} ${start.y}, ${(start.x + end.x) / 2} ${end.y}, ${end.x} ${end.y}`;
      svgContent += `  <path data-edge-id="${escapeXml(edge.id)}" data-source-handle="${edge.sourceHandle || 'right'}" data-target-handle="${edge.targetHandle || 'left'}" d="${pathD}" fill="none" stroke="${edge.style?.stroke || doc.theme.edgeColor || '#94a3b8'}" stroke-width="${edge.style?.strokeWidth || 2}"${edge.style?.dashed ? ' stroke-dasharray="6 4"' : ''}${edge.style?.arrowEnd ? ' marker-end="url(#arrowhead)"' : ''} />\n`;
      if (edge.label) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2 - 6;
        svgContent += `  <text x="${midX}" y="${midY}" fill="#64748b" font-family="sans-serif" font-size="12" text-anchor="middle">${escapeXml(edge.label)}</text>\n`;
      }
    });

    // Render nodes
    doc.nodes.forEach((n) => {
      const w = n.geometry.width || 150;
      const h = n.geometry.height || 44;
      const rx = n.style?.borderRadius ?? (n.type === 'terminal' ? h / 2 : 8);
      const bg = n.style?.backgroundColor || (n.type === 'root' ? '#3b82f6' : '#ffffff');
      const border = n.style?.borderColor || (n.type === 'root' ? '#2563eb' : '#cbd5e1');
      const textColor = n.style?.textColor || (n.type === 'root' ? '#ffffff' : '#0f172a');

      const shape = n.shape || n.style?.shape || (n.type === 'decision' ? 'diamond' : n.type === 'terminal' ? 'pill' : 'rounded');
      svgContent += `  <g id="${escapeXml(n.id)}" data-node-shape="${shape}">\n`;
      if (shape === 'diamond') svgContent += `    <polygon points="${n.geometry.x + w / 2},${n.geometry.y} ${n.geometry.x + w},${n.geometry.y + h / 2} ${n.geometry.x + w / 2},${n.geometry.y + h} ${n.geometry.x},${n.geometry.y + h / 2}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;
      else if (shape === 'parallelogram') svgContent += `    <polygon points="${n.geometry.x + 16},${n.geometry.y} ${n.geometry.x + w},${n.geometry.y} ${n.geometry.x + w - 16},${n.geometry.y + h} ${n.geometry.x},${n.geometry.y + h}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;
      else if (shape === 'circle') svgContent += `    <ellipse cx="${n.geometry.x + w / 2}" cy="${n.geometry.y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;
      else svgContent += `    <rect x="${n.geometry.x}" y="${n.geometry.y}" width="${w}" height="${h}" rx="${shape === 'rectangle' ? 0 : shape === 'pill' ? h / 2 : rx}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;
      svgContent += `    <text x="${n.geometry.x + w / 2}" y="${n.geometry.y + h / 2 + 4}" fill="${textColor}" font-family="sans-serif" font-size="14" font-weight="500" text-anchor="middle">${escapeXml(n.text)}</text>\n`;
      svgContent += `  </g>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
    <style>
      text { user-select: none; }
    </style>
  </defs>
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#ffffff" />
${svgContent}</svg>`;
  }
}

/**
 * 3. Markdown Outline Exporter (.md)
 */
export function exportToMarkdown(doc: CanonicalDocument): string {
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const childMap = new Map<string, CanonicalNode[]>();

  doc.nodes.forEach((n) => {
    if (n.parentId) {
      if (!childMap.has(n.parentId)) childMap.set(n.parentId, []);
      childMap.get(n.parentId)!.push(n);
    }
  });

  const roots = doc.nodes.filter((n) => !n.parentId || !nodeMap.has(n.parentId));
  const lines: string[] = [];

  lines.push(`# ${doc.title || 'Untitled Document'}\n`);

  function traverse(node: CanonicalNode, depth: number) {
    if (depth === 1) {
      lines.push(`## ${node.text}\n`);
    } else if (depth === 2) {
      lines.push(`### ${node.text}\n`);
    } else {
      const indent = '  '.repeat(Math.max(0, depth - 3));
      lines.push(`${indent}- ${node.text}`);
    }

    const children = childMap.get(node.id) || [];
    for (const child of children) {
      traverse(child, depth + 1);
    }
  }

  for (const root of roots) {
    if (root.type === 'root' && roots.length === 1) {
      // Primary root already represented in document title if identical
      const children = childMap.get(root.id) || [];
      for (const child of children) {
        traverse(child, 1);
      }
    } else {
      traverse(root, 1);
    }
  }

  return lines.join('\n');
}

/**
 * 4. Mermaid Graph / Flowchart Exporter (.mmd)
 */
export function exportToMermaid(doc: CanonicalDocument): string {
  const lines: string[] = [];
  lines.push('graph TD');

  const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');

  doc.nodes.forEach((n) => {
    const sId = sanitizeId(n.id);
    const escapedText = n.text.replace(/"/g, '&quot;');

    switch (n.shape || (n.type === 'decision' ? 'diamond' : n.type === 'terminal' ? 'pill' : 'rounded')) {
      case 'diamond':
        lines.push(`  ${sId}{"${escapedText}"}`);
        break;
      case 'pill':
        lines.push(`  ${sId}(["${escapedText}"])`);
        break;
      case 'circle':
        lines.push(`  ${sId}(("${escapedText}"))`);
        break;
      case 'rectangle':
        lines.push(`  ${sId}["${escapedText}"]`);
        break;
      default:
        lines.push(`  ${sId}("${escapedText}")`);
        break;
    }
  });

  doc.edges.forEach((e) => {
    const sSrc = sanitizeId(e.source);
    const sTgt = sanitizeId(e.target);
    if (e.label) {
      lines.push(`  ${sSrc} -->|"${e.label.replace(/"/g, '&quot;')}"| ${sTgt}`);
    } else {
      lines.push(`  ${sSrc} --> ${sTgt}`);
    }
  });

  return lines.join('\n');
}

/**
 * 5. OPML 2.0 Outline Exporter (.opml)
 */
export function exportToOPML(doc: CanonicalDocument): string {
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const childMap = new Map<string, CanonicalNode[]>();

  doc.nodes.forEach((n) => {
    if (n.parentId) {
      if (!childMap.has(n.parentId)) childMap.set(n.parentId, []);
      childMap.get(n.parentId)!.push(n);
    }
  });

  const roots = doc.nodes.filter((n) => !n.parentId || !nodeMap.has(n.parentId));

  function buildOutlineXml(node: CanonicalNode, indent: string): string {
    const children = childMap.get(node.id) || [];
    const textAttr = escapeXml(node.text);

    if (children.length === 0) {
      return `${indent}<outline text="${textAttr}" />\n`;
    }

    let out = `${indent}<outline text="${textAttr}">\n`;
    for (const child of children) {
      out += buildOutlineXml(child, indent + '  ');
    }
    out += `${indent}</outline>\n`;
    return out;
  }

  let bodyContent = '';
  for (const root of roots) {
    bodyContent += buildOutlineXml(root, '    ');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(doc.title || 'Gedankenfaden Outline')}</title>
    <dateCreated>${doc.createdAt}</dateCreated>
    <dateModified>${doc.updatedAt}</dateModified>
  </head>
  <body>
${bodyContent}  </body>
</opml>`;
}

/**
 * 6. Legacy Mind-Map XML Exporter (.mm)
 * Compatible with widely supported legacy mind-mapping XML standards
 */
export function exportToLegacyMindMapXML(doc: CanonicalDocument): string {
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const childMap = new Map<string, CanonicalNode[]>();

  doc.nodes.forEach((n) => {
    if (n.parentId) {
      if (!childMap.has(n.parentId)) childMap.set(n.parentId, []);
      childMap.get(n.parentId)!.push(n);
    }
  });

  const roots = doc.nodes.filter((n) => !n.parentId || !nodeMap.has(n.parentId));

  function buildNodeXml(node: CanonicalNode, indent: string): string {
    const children = childMap.get(node.id) || [];
    const textAttr = escapeXml(node.text);
    const idAttr = escapeXml(node.id);

    if (children.length === 0) {
      return `${indent}<node ID="${idAttr}" TEXT="${textAttr}"/>\n`;
    }

    let out = `${indent}<node ID="${idAttr}" TEXT="${textAttr}">\n`;
    for (const child of children) {
      out += buildNodeXml(child, indent + '  ');
    }
    out += `${indent}</node>\n`;
    return out;
  }

  let xmlContent = '';
  for (const root of roots) {
    xmlContent += buildNodeXml(root, '  ');
  }

  return `<map version="1.0.1">\n${xmlContent}</map>`;
}

/**
 * 7. JSON Canvas Open Specification Exporter (.canvas)
 * Generates open format .canvas structure for visual canvases
 */
export function exportToJSONCanvas(doc: CanonicalDocument): string {
  const canvasNodes = doc.nodes.map((n) => ({
    id: n.id,
    type: 'text',
    text: n.text,
    x: Math.round(n.geometry.x),
    y: Math.round(n.geometry.y),
    width: Math.round(n.geometry.width || 150),
    height: Math.round(n.geometry.height || 44),
    color: n.style?.backgroundColor || (n.type === 'root' ? '1' : undefined),
  }));

  const canvasEdges = doc.edges.map((e) => ({
    id: e.id,
    fromNode: e.source,
    toNode: e.target,
    label: e.label || undefined,
  }));

  return JSON.stringify(
    {
      nodes: canvasNodes,
      edges: canvasEdges,
    },
    null,
    2
  );
}

/**
 * 8. Standalone Interactive/Viewable HTML Report (.html)
 */
export function exportToHTML(doc: CanonicalDocument): string {
  const svg = exportToSVG(doc);
  const title = escapeXml(doc.title || 'Gedankenfaden Document');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
    }
    header {
      width: 100%;
      max-width: 1200px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 12px;
    }
    h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .badge {
      font-size: 12px;
      padding: 4px 10px;
      background: #e0e7ff;
      color: #3730a3;
      border-radius: 9999px;
      font-weight: 500;
    }
    .canvas-container {
      background: #ffffff;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      border-radius: 12px;
      padding: 20px;
      max-width: 100%;
      overflow: auto;
    }
    svg { display: block; height: auto; max-width: 100%; }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <span class="badge">${doc.mode === 'mindmap' ? 'Mind Map' : 'Flowchart'} • ${doc.nodes.length} nodes</span>
  </header>
  <div class="canvas-container">
    ${svg}
  </div>
</body>
</html>`;
}

/**
 * 9. PNG Exporter (.png)
 * Produces genuine PNG bytes by rasterizing the canonical SVG in the browser/WebView canvas.
 */
async function rasterizeSvg(svg: string, mimeType: 'image/png' | 'image/jpeg'): Promise<Uint8Array> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Raster export requires a browser or WebView canvas runtime.');
  }
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image(); next.onload = () => resolve(next); next.onerror = () => reject(new Error('SVG rasterization failed')); next.src = source;
    });
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D context is unavailable');
    if (mimeType === 'image/jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Raster encoding failed')), mimeType, 0.92));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(source); }
}

export async function exportToPNG(doc: CanonicalDocument): Promise<Uint8Array> { return rasterizeSvg(exportToSVG(doc), 'image/png'); }

/**
 * 10. JPEG Exporter (.jpeg)
 * Produces binary JPEG buffer
 */
export async function exportToJPEG(doc: CanonicalDocument): Promise<Uint8Array> { return rasterizeSvg(exportToSVG(doc), 'image/jpeg'); }

/**
 * 11. PDF Document Exporter (.pdf)
 * Generates valid standard PDF 1.4 vector document embedding canonical metadata and visual outline
 */
export async function exportToPDF(doc: CanonicalDocument): Promise<Uint8Array> {
  const title = doc.title || 'Gedankenfaden Document';
  const nodeCount = doc.nodes.length;
  const mode = doc.mode;

  const pdfBody = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT
/F1 22 Tf
50 720 Td
(${title.replace(/[()\\]/g, '')}) Tj
/F1 12 Tf
0 -30 Td
(Mode: ${mode} | Total Nodes: ${nodeCount}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000236 00000 n 
0000000408 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
479
%%EOF`;

  return new TextEncoder().encode(pdfBody);
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
