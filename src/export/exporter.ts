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
import { wrapNodeText } from '../model/textMeasurement';


import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import notoSansScUnicode from '@fontsource-variable/noto-sans-sc/unicode.json';

const notoSansScFiles = import.meta.glob('../../node_modules/@fontsource-variable/noto-sans-sc/files/*.woff2', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

interface PdfTextPlacement { text: string; x: number; y: number; size: number; centered: boolean; color: string }

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

  const effectiveBoxes = computeEffectiveNodeBoxes(doc);

  let minX = Infinity;
  let minY = Infinity;
  maxX_calc: {
    let maxX = -Infinity;
    let maxY = -Infinity;

    doc.nodes.forEach((n) => {
      const box = effectiveBoxes.get(n.id)!;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
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
        const box = effectiveBoxes.get(node.id)!;
        if (handle === 'left') return { x: box.x, y: box.y + box.height / 2 };
        if (handle === 'top') return { x: box.x + box.width / 2, y: box.y };
        if (handle === 'bottom') return { x: box.x + box.width / 2, y: box.y + box.height };
        return { x: box.x + box.width, y: box.y + box.height / 2 };
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
      const box = effectiveBoxes.get(n.id)!;
      const w = box.width;
      const h = box.height;
      const nx = box.x;
      const ny = box.y;
      const fontSize = n.style?.fontSize || 14;
      const rx = n.style?.borderRadius ?? (n.type === 'terminal' ? h / 2 : 8);
      const bg = n.style?.backgroundColor || (n.type === 'root' ? '#3b82f6' : '#ffffff');
      const border = n.style?.borderColor || (n.type === 'root' ? '#2563eb' : '#cbd5e1');
      const textColor = n.style?.textColor || (n.type === 'root' ? '#ffffff' : '#0f172a');

      const shape = n.shape || n.style?.shape || (n.type === 'decision' ? 'diamond' : n.type === 'terminal' ? 'pill' : 'rounded');
      svgContent += `  <g id="${escapeXml(n.id)}" data-node-shape="${shape}">\n`;
      if (shape === 'diamond') svgContent += `    <polygon points="${nx + w / 2},${ny} ${nx + w},${ny + h / 2} ${nx + w / 2},${ny + h} ${nx},${ny + h / 2}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;
      else if (shape === 'parallelogram') svgContent += `    <polygon points="${nx + 16},${ny} ${nx + w},${ny} ${nx + w - 16},${ny + h} ${nx},${ny + h}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;
      else if (shape === 'circle') svgContent += `    <ellipse cx="${nx + w / 2}" cy="${ny + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;
      else svgContent += `    <rect x="${nx}" y="${ny}" width="${w}" height="${h}" rx="${shape === 'rectangle' ? 0 : shape === 'pill' ? h / 2 : rx}" fill="${bg}" stroke="${border}" stroke-width="${n.style?.borderWidth || 1.5}" />\n`;

      const blockHeight = box.lines.length * box.lineHeight;
      const firstLineY = ny + h / 2 - blockHeight / 2 + box.lineHeight * 0.75;
      const tspans = box.lines
        .map((line, i) => `<tspan x="${nx + w / 2}" y="${firstLineY + i * box.lineHeight}">${escapeXml(line)}</tspan>`)
        .join('');
      svgContent += `    <text fill="${textColor}" font-family="sans-serif" font-size="${fontSize}" font-weight="500" text-anchor="middle">${tspans}</text>\n`;
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
 * Generates a printable PDF 1.4 vector diagram.
 */
export async function exportToPDF(doc: CanonicalDocument): Promise<Uint8Array> {
  const visibleBounds = [
    ...doc.nodes.map((node) => ({ x: node.geometry.x, y: node.geometry.y, width: node.geometry.width || 150, height: node.geometry.height || 44 })),
    ...doc.groups.flatMap((group) => group.bounds ? [group.bounds] : []),
  ];
  const minX = visibleBounds.length ? Math.min(...visibleBounds.map((bounds) => bounds.x)) : 0;
  const minY = visibleBounds.length ? Math.min(...visibleBounds.map((bounds) => bounds.y)) : 0;
  const maxX = visibleBounds.length ? Math.max(...visibleBounds.map((bounds) => bounds.x + bounds.width)) : 480;
  const maxY = visibleBounds.length ? Math.max(...visibleBounds.map((bounds) => bounds.y + bounds.height)) : 360;
  const diagramWidth = Math.max(1, maxX - minX);
  const diagramHeight = Math.max(1, maxY - minY);
  const landscape = diagramWidth >= diagramHeight;
  const pageWidth = landscape ? 792 : 612;
  const pageHeight = landscape ? 612 : 792;
  const margin = 42;
  const scale = Math.min(1, (pageWidth - margin * 2) / diagramWidth, (pageHeight - margin * 2) / diagramHeight);
  const offsetX = (pageWidth - diagramWidth * scale) / 2;
  const offsetY = (pageHeight - diagramHeight * scale) / 2;
  const x = (value: number) => offsetX + (value - minX) * scale;
  const y = (value: number) => offsetY + (maxY - value) * scale;
  const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
  const content: string[] = ['1 J 1 j'];
  const unicodePlacements: PdfTextPlacement[] = [];

  const setStroke = (color: string, width: number, dashed = false) => {
    const [r, g, b] = pdfRgb(color);
    content.push(`${r} ${g} ${b} RG ${Math.max(0.5, width * scale)} w ${dashed ? '[6 4] 0 d' : '[] 0 d'}`);
  };
  const setFill = (color: string) => {
    const [r, g, b] = pdfRgb(color);
    content.push(`${r} ${g} ${b} rg`);
  };
  const anchor = (node: CanonicalNode, handle: string | undefined) => {
    const width = node.geometry.width || 150;
    const height = node.geometry.height || 44;
    if (handle === 'left') return { x: node.geometry.x, y: node.geometry.y + height / 2 };
    if (handle === 'top') return { x: node.geometry.x + width / 2, y: node.geometry.y };
    if (handle === 'bottom') return { x: node.geometry.x + width / 2, y: node.geometry.y + height };
    return { x: node.geometry.x + width, y: node.geometry.y + height / 2 };
  };

  doc.groups.forEach((group) => {
    if (!group.bounds) return;
    const left = x(group.bounds.x);
    const bottom = y(group.bounds.y + group.bounds.height);
    const width = group.bounds.width * scale;
    const height = group.bounds.height * scale;
    setFill(group.style?.backgroundColor || '#f1f5f9');
    setStroke(group.style?.borderColor || '#cbd5e1', 1.5, true);
    content.push(`${left} ${bottom} ${width} ${height} re B`);
    setFill('#334155');
    drawPdfText(content, group.title, left + 10 * scale, bottom + height - 18 * scale, 12 * scale, false, unicodePlacements, '#334155');
  });

  doc.edges.forEach((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return;
    const start = anchor(source, edge.sourceHandle);
    const end = anchor(target, edge.targetHandle);
    setStroke(edge.style?.stroke || doc.theme.edgeColor || '#64748b', edge.style?.strokeWidth || 2, edge.style?.dashed);
    let arrowStart = start;
    let labelPosition = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    if (edge.type === 'bezier') {
      const midX = (start.x + end.x) / 2;
      content.push(`${x(start.x)} ${y(start.y)} m ${x(midX)} ${y(start.y)} ${x(midX)} ${y(end.y)} ${x(end.x)} ${y(end.y)} c S`);
    } else if (edge.type === 'orthogonal') {
      const route = calculateOrthogonalPath(start, end, edge.sourceHandle as 'left' | 'right' | 'top' | 'bottom', edge.targetHandle as 'left' | 'right' | 'top' | 'bottom');
      content.push(`${svgPathToPdfPath(route.path, x, y)} S`);
      arrowStart = route.points.at(-2) || start;
      labelPosition = route.labelPosition;
    } else if (edge.type === 'smoothstep') {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const path = `M ${start.x} ${start.y} Q ${start.x} ${midY} ${midX} ${midY} Q ${end.x} ${midY} ${end.x} ${end.y}`;
      content.push(`${svgPathToPdfPath(path, x, y)} S`);
      arrowStart = { x: midX, y: midY };
    } else {
      content.push(`${x(start.x)} ${y(start.y)} m ${x(end.x)} ${y(end.y)} l S`);
    }
    if (edge.style?.arrowEnd) {
      const angle = Math.atan2(y(end.y) - y(arrowStart.y), x(end.x) - x(arrowStart.x));
      const size = 8 * scale;
      const leftX = x(end.x) - Math.cos(angle - Math.PI / 6) * size;
      const leftY = y(end.y) - Math.sin(angle - Math.PI / 6) * size;
      const rightX = x(end.x) - Math.cos(angle + Math.PI / 6) * size;
      const rightY = y(end.y) - Math.sin(angle + Math.PI / 6) * size;
      content.push(`${x(end.x)} ${y(end.y)} m ${leftX} ${leftY} l ${rightX} ${rightY} l h f`);
    }
    if (edge.label) drawPdfText(content, edge.label, x(labelPosition.x), y(labelPosition.y) + 5 * scale, 11 * scale, false, unicodePlacements, '#64748b');
  });

  doc.nodes.forEach((node) => {
    const width = (node.geometry.width || 150) * scale;
    const height = (node.geometry.height || 44) * scale;
    const left = x(node.geometry.x);
    const bottom = y(node.geometry.y + (node.geometry.height || 44));
    const shape = node.shape || node.style?.shape || (node.type === 'decision' ? 'diamond' : node.type === 'terminal' ? 'pill' : 'rounded');
    setFill(node.style?.backgroundColor || (node.type === 'root' ? '#3b82f6' : '#ffffff'));
    setStroke(node.style?.borderColor || (node.type === 'root' ? '#2563eb' : '#cbd5e1'), node.style?.borderWidth || 1.5);
    if (shape === 'diamond') {
      content.push(`${left + width / 2} ${bottom + height} m ${left + width} ${bottom + height / 2} l ${left + width / 2} ${bottom} l ${left} ${bottom + height / 2} l h B`);
    } else if (shape === 'parallelogram') {
      const slant = Math.min(16 * scale, width / 4);
      content.push(`${left + slant} ${bottom + height} m ${left + width} ${bottom + height} l ${left + width - slant} ${bottom} l ${left} ${bottom} l h B`);
    } else if (shape === 'circle') {
      const k = 0.5522847498;
      const rx = width / 2; const ry = height / 2; const cx = left + rx; const cy = bottom + ry;
      content.push(`${cx + rx} ${cy} m ${cx + rx} ${cy + k * ry} ${cx + k * rx} ${cy + ry} ${cx} ${cy + ry} c ${cx - k * rx} ${cy + ry} ${cx - rx} ${cy + k * ry} ${cx - rx} ${cy} c ${cx - rx} ${cy - k * ry} ${cx - k * rx} ${cy - ry} ${cx} ${cy - ry} c ${cx + k * rx} ${cy - ry} ${cx + rx} ${cy - k * ry} ${cx + rx} ${cy} c h B`);
    } else if (shape === 'rounded' || shape === 'pill') {
      const radius = shape === 'pill' ? height / 2 : Math.min((node.style?.borderRadius ?? 8) * scale, width / 2, height / 2);
      const k = 0.5522847498;
      content.push(`${left + radius} ${bottom} m ${left + width - radius} ${bottom} l ${left + width - radius + k * radius} ${bottom} ${left + width} ${bottom + radius - k * radius} ${left + width} ${bottom + radius} c ${left + width} ${bottom + height - radius} l ${left + width} ${bottom + height - radius + k * radius} ${left + width - radius + k * radius} ${bottom + height} ${left + width - radius} ${bottom + height} c ${left + radius} ${bottom + height} l ${left + radius - k * radius} ${bottom + height} ${left} ${bottom + height - radius + k * radius} ${left} ${bottom + height - radius} c ${left} ${bottom + radius} l ${left} ${bottom + radius - k * radius} ${left + radius - k * radius} ${bottom} ${left + radius} ${bottom} c h B`);
    } else {
      content.push(`${left} ${bottom} ${width} ${height} re B`);
    }
    const textColor = node.style?.textColor || (node.type === 'root' ? '#ffffff' : '#0f172a');
    const [r, g, b] = pdfRgb(textColor);
    content.push(`${r} ${g} ${b} rg`);
    drawPdfText(content, node.text, left + width / 2, bottom + height / 2 - 4 * scale, (node.style?.fontSize || 14) * scale, true, unicodePlacements, textColor);
  });

  const stream = `${content.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  return addUnicodePdfText(buildPdf(objects), unicodePlacements);
}

function pdfRgb(color: string): [string, string, string] {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return ['0.4', '0.45', '0.52'];
  return [0, 2, 4].map((index) => (parseInt(match[1].slice(index, index + 2), 16) / 255).toFixed(3)) as [string, string, string];
}

function pdfText(text: string): string {
  return text.replace(/([()\\])/g, '\\$1');
}

function svgPathToPdfPath(path: string, x: (value: number) => number, y: (value: number) => number): string {
  const tokens = path.match(/[MLQC]|-?\d+(?:\.\d+)?/g) || [];
  const commands: string[] = [];
  let index = 0;
  let current = { x: 0, y: 0 };

  const readNumber = () => Number(tokens[index++]);
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'M') {
      current = { x: readNumber(), y: readNumber() };
      commands.push(`${x(current.x)} ${y(current.y)} m`);
    } else if (command === 'L') {
      current = { x: readNumber(), y: readNumber() };
      commands.push(`${x(current.x)} ${y(current.y)} l`);
    } else if (command === 'Q') {
      const control = { x: readNumber(), y: readNumber() };
      const end = { x: readNumber(), y: readNumber() };
      const c1 = {
        x: current.x + (2 / 3) * (control.x - current.x),
        y: current.y + (2 / 3) * (control.y - current.y),
      };
      const c2 = {
        x: end.x + (2 / 3) * (control.x - end.x),
        y: end.y + (2 / 3) * (control.y - end.y),
      };
      commands.push(`${x(c1.x)} ${y(c1.y)} ${x(c2.x)} ${y(c2.y)} ${x(end.x)} ${y(end.y)} c`);
      current = end;
    } else if (command === 'C') {
      const c1 = { x: readNumber(), y: readNumber() };
      const c2 = { x: readNumber(), y: readNumber() };
      const end = { x: readNumber(), y: readNumber() };
      commands.push(`${x(c1.x)} ${y(c1.y)} ${x(c2.x)} ${y(c2.y)} ${x(end.x)} ${y(end.y)} c`);
      current = end;
    }
  }
  return commands.join(' ');
}

function drawPdfText(commands: string[], text: string, centerX: number, baselineY: number, size: number, centered = false, placements?: PdfTextPlacement[], color = '#0f172a') {
  const unicode = /[^\x20-\x7e]/.test(text);
  if (unicode) {
    placements?.push({ text, x: centerX, y: baselineY, size: Math.max(4, size), centered, color });
    return;
  }
  const safe = pdfText(text);
  const estimatedWidth = safe.length * size * 0.52;
  commands.push(`BT /F1 ${Math.max(4, size)} Tf ${centered ? centerX - estimatedWidth / 2 : centerX} ${baselineY} Td (${safe}) Tj ET`);
}

const notoSansSubsets = Object.entries(notoSansScUnicode as Record<string, string>).map(([rawName, definition]) => ({
  name: rawName.replace(/[\[\]]/g, ''),
  ranges: definition.split(',').map((part) => {
    const [start, end = start] = part.replace(/^U\+/, '').split('-');
    return [parseInt(start, 16), parseInt(end, 16)] as const;
  }),
}));

function notoSubsetFor(character: string): string {
  const codepoint = character.codePointAt(0) || 0;
  const subset = notoSansSubsets.find((candidate) => candidate.ranges.some(([start, end]) => codepoint >= start && codepoint <= end));
  if (!subset) throw new Error(`PDF export cannot represent Unicode code point U+${codepoint.toString(16).toUpperCase()}.`);
  return subset.name;
}

async function addUnicodePdfText(pdfBytes: Uint8Array, placements: PdfTextPlacement[]): Promise<Uint8Array> {
  if (placements.length === 0) return pdfBytes;
  const pdf = await PDFDocument.load(pdfBytes);
  pdf.registerFontkit(fontkit);
  const page = pdf.getPage(0);
  const fonts = new Map<string, PDFFont>();

  const getFont = async (subset: string) => {
    const cached = fonts.get(subset);
    if (cached) return cached;
    const suffix = `/noto-sans-sc-${subset}-wght-normal.woff2`;
    const fontUrl = Object.entries(notoSansScFiles).find(([path]) => path.endsWith(suffix))?.[1];
    if (!fontUrl) throw new Error(`Bundled PDF font subset is missing: ${subset}.`);
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Bundled PDF font subset could not be loaded: ${subset}.`);
    const font = await pdf.embedFont(await response.arrayBuffer(), { subset: true });
    fonts.set(subset, font);
    return font;
  };

  for (const placement of placements) {
    const runs: Array<{ subset: string; text: string; font?: PDFFont }> = [];
    for (const character of Array.from(placement.text)) {
      const subset = notoSubsetFor(character);
      const current = runs.at(-1);
      if (current?.subset === subset) current.text += character;
      else runs.push({ subset, text: character });
    }
    for (const run of runs) run.font = await getFont(run.subset);
    const totalWidth = runs.reduce((width, run) => width + run.font!.widthOfTextAtSize(run.text, placement.size), 0);
    let cursor = placement.centered ? placement.x - totalWidth / 2 : placement.x;
    const [r, g, b] = pdfRgb(placement.color).map(Number);
    for (const run of runs) {
      page.drawText(run.text, { x: cursor, y: placement.y, size: placement.size, font: run.font, color: rgb(r, g, b) });
      cursor += run.font!.widthOfTextAtSize(run.text, placement.size);
    }
  }
  return pdf.save();
}

function buildPdf(objects: string[]): Uint8Array {
  let pdf = '%PDF-1.4\n%Gedankenfaden\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

interface EffectiveNodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  lineHeight: number;
}

/**
 * Grows a node's declared height (never its width) to fit its wrapped text,
 * symmetrically around the original vertical center so left/right edge
 * anchors (which use y + height/2) keep pointing at the same absolute Y.
 * This is the single source of "real" per-node geometry export uses for
 * bounds, edges, and rendering, so all three stay consistent with each other.
 */
function computeEffectiveNodeBoxes(doc: CanonicalDocument): Map<string, EffectiveNodeBox> {
  const boxes = new Map<string, EffectiveNodeBox>();
  doc.nodes.forEach((n) => {
    const width = n.geometry.width || 150;
    const declaredHeight = n.geometry.height || 44;
    const fontSize = n.style?.fontSize || 14;
    const { lines, lineHeight } = wrapNodeText(n.text || '', width, fontSize);
    const textBlockHeight = lines.length * lineHeight;
    const requiredHeight = Math.max(declaredHeight, textBlockHeight + 16);
    const grownBy = requiredHeight - declaredHeight;

    boxes.set(n.id, {
      x: n.geometry.x,
      y: n.geometry.y - grownBy / 2,
      width,
      height: requiredHeight,
      lines,
      lineHeight,
    });
  });
  return boxes;
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
