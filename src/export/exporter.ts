import { CanonicalDocument } from '../model/types';
import { serializeDocument } from '../model/document';

/**
 * Native Lossless JSON Exporter
 */
export function exportToJSON(doc: CanonicalDocument): string {
  return serializeDocument(doc);
}

/**
 * Vector SVG Exporter
 * Generates pure vector SVG directly from canonical document geometry.
 */
export function exportToSVG(doc: CanonicalDocument): string {
  if (doc.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"></svg>`;
  }

  // Calculate bounding box
  let minX = Infinity;
  let minY = Infinity;
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

  // Build node lookup
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));

  // Build SVG content
  let svgContent = '';

  // Render edges
  doc.edges.forEach((edge) => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;

    const srcW = src.geometry.width || 150;
    const srcH = src.geometry.height || 44;
    const tgtH = tgt.geometry.height || 44;

    const x1 = src.geometry.x + srcW;
    const y1 = src.geometry.y + srcH / 2;
    const x2 = tgt.geometry.x;
    const y2 = tgt.geometry.y + tgtH / 2;

    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    svgContent += `  <path d="${pathD}" fill="none" stroke="#94a3b8" stroke-width="2" />\n`;
    if (edge.label) {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 - 6;
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

    svgContent += `  <g id="${n.id}">\n`;
    svgContent += `    <rect x="${n.geometry.x}" y="${n.geometry.y}" width="${w}" height="${h}" rx="${rx}" fill="${bg}" stroke="${border}" stroke-width="1.5" />\n`;
    svgContent += `    <text x="${n.geometry.x + w / 2}" y="${n.geometry.y + h / 2 + 4}" fill="${textColor}" font-family="sans-serif" font-size="14" font-weight="500" text-anchor="middle">${escapeXml(n.text)}</text>\n`;
    svgContent += `  </g>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
  <defs>
    <style>
      text { user-select: none; }
    </style>
  </defs>
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#ffffff" />
${svgContent}</svg>`;
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
