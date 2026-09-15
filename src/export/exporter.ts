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

import { CanonicalDocument, CanonicalNode, CanonicalGroup } from '../model/types';
import { serializeDocument } from '../model/document';
import { calculateOrthogonalPath } from '../model/routing';
import { AssetStore } from '../model/assets';
import { resolveNodeVisuals } from '../model/theme';
import { resolveGroupBounds } from '../model/groups';
import { buildExportScene, SceneNode } from './exportScene';
import { PDFDocument, PDFFont, PDFImage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import notoSansScUnicode from '@fontsource-variable/noto-sans-sc/unicode.json';

/**
 * Resolves the export `assets` map (asset filename -> raw bytes, the same
 * map `.mflow` packaging already receives) into an `AssetStore` lookup, so
 * SVG/HTML/PDF can embed a node's `assetRef` image without inventing a
 * second asset identity model (EX-11).
 */
function resolveAssetStore(assets?: Map<string, Uint8Array>): AssetStore | undefined {
  if (!assets || assets.size === 0) return undefined;
  return AssetStore.fromBytesMap(assets);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

const notoSansScFiles = import.meta.glob('../../node_modules/@fontsource-variable/noto-sans-sc/files/*.woff2', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

interface PdfTextPlacement { text: string; x: number; y: number; size: number; centered: boolean; color: string }
interface PdfImagePlacement { data: Uint8Array; mimeType: string; x: number; y: number; width: number; height: number }

/**
 * 1. Native Lossless JSON Exporter (.json)
 */
export function exportToJSON(doc: CanonicalDocument): string {
  return serializeDocument(doc);
}

/**
 * 2. Vector SVG Exporter (.svg)
 */
export function exportToSVG(doc: CanonicalDocument, assets?: Map<string, Uint8Array>): string {
  if (doc.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"></svg>`;
  }

  const assetStore = resolveAssetStore(assets);
  const scene = buildExportScene(doc, (n) => Boolean(n.assetRef && assetStore?.getAsset(n.assetRef)));

  const padding = 60;
  const vbX = Math.floor(scene.bounds.minX - padding);
  const vbY = Math.floor(scene.bounds.minY - padding);
  const vbW = Math.ceil(scene.bounds.maxX - scene.bounds.minX + padding * 2);
  const vbH = Math.ceil(scene.bounds.maxY - scene.bounds.minY + padding * 2);

  const boxById = new Map(scene.nodes.map((sn) => [sn.node.id, sn]));
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  let svgContent = '';

  // F7/EX-08: background pattern natively expressed as an SVG pattern, using
  // the same dots/lines/none projection Canvas uses -- never the document's
  // own hardcoded white fill.
  let backgroundDefs = '';
  let backgroundFill = `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${escapeXml(scene.background.fill)}" />`;
  if (scene.background.pattern !== 'none') {
    if (scene.background.pattern === 'dots') {
      backgroundDefs = `<pattern id="canvas-bg-pattern" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="${escapeXml(scene.background.patternColor)}" /></pattern>`;
    } else {
      backgroundDefs = `<pattern id="canvas-bg-pattern" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M 22 0 L 0 0 0 22" fill="none" stroke="${escapeXml(scene.background.patternColor)}" stroke-width="1" /></pattern>`;
    }
    backgroundFill += `\n  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="url(#canvas-bg-pattern)" />`;
  }

  // EX-05: boundary annotations are background regions, drawn behind groups
  // and primary node content.
  for (const ann of scene.annotations) {
    if (ann.kind !== 'boundary') continue;
    const style = ann.annotation.style;
    svgContent += `  <g data-annotation-id="${escapeXml(ann.annotation.id)}" data-annotation-kind="boundary"><rect x="${ann.box.x}" y="${ann.box.y}" width="${ann.box.width}" height="${ann.box.height}" rx="${style?.borderRadius ?? 12}" fill="${escapeXml(style?.fillColor || 'rgba(59,130,246,0.08)')}" fill-opacity="${style?.fillOpacity ?? 1}" stroke="${escapeXml(style?.borderColor || '#93c5fd')}" stroke-width="${style?.borderWidth ?? 1.5}"${style?.borderStyle === 'dashed' ? ' stroke-dasharray="8 6"' : ''} />`;
    if (ann.annotation.title) {
      svgContent += `<text x="${ann.box.x + 10}" y="${ann.box.y + 20}" fill="${escapeXml(style?.borderColor || '#3b82f6')}" font-family="${escapeXml(doc.theme?.fontFamily || 'sans-serif')}" font-size="12" font-weight="600">${escapeXml(ann.annotation.title)}</text>`;
    }
    svgContent += `</g>\n`;
  }

  scene.groups.forEach(({ group, bounds }: { group: CanonicalGroup; bounds: { x: number; y: number; width: number; height: number } }) => {
    svgContent += `  <g data-group-id="${escapeXml(group.id)}"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" rx="12" fill="${escapeXml(group.style?.backgroundColor || 'rgba(241,245,249,0.65)')}" stroke="${escapeXml(group.style?.borderColor || '#cbd5e1')}" stroke-width="2" stroke-dasharray="6 4"/><text x="${bounds.x + 12}" y="${bounds.y + 22}" fill="#334155" font-family="${escapeXml(doc.theme?.fontFamily || 'sans-serif')}" font-size="12" font-weight="600">${escapeXml(group.title)}</text></g>\n`;
  });

  // Render edges
  doc.edges.forEach((edge) => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;

    const anchor = (node: CanonicalNode, handle: string | undefined) => {
      const box = boxById.get(node.id)!.box;
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
      svgContent += `  <text x="${midX}" y="${midY}" fill="#64748b" font-family="${escapeXml(doc.theme?.fontFamily || 'sans-serif')}" font-size="12" text-anchor="middle">${escapeXml(edge.label)}</text>\n`;
    }
  });

  // EX-05: relationship lines and braces sit above edges/groups so they
  // remain visible, but are still drawn before nodes so node text on top
  // stays readable.
  for (const ann of scene.annotations) {
    if (ann.kind === 'relationshipLine') {
      const style = ann.annotation.style;
      const markerEnd = style?.arrowEnd ? ' marker-end="url(#rel-arrow-end)"' : '';
      const markerStart = style?.arrowStart ? ' marker-start="url(#rel-arrow-start)"' : '';
      svgContent += `  <path data-annotation-id="${escapeXml(ann.annotation.id)}" data-annotation-kind="relationshipLine" d="${ann.geometry.pathD}" fill="none" stroke="${escapeXml(style?.stroke || '#6366f1')}" stroke-width="${style?.strokeWidth ?? 2}"${style?.lineStyle === 'dashed' ? ' stroke-dasharray="6 4"' : ''}${markerStart}${markerEnd} />\n`;
      if (ann.annotation.label) {
        svgContent += `  <text x="${ann.geometry.midPoint.x}" y="${ann.geometry.midPoint.y - 6}" fill="${escapeXml(style?.stroke || '#6366f1')}" font-family="${escapeXml(doc.theme?.fontFamily || 'sans-serif')}" font-size="12" text-anchor="middle">${escapeXml(ann.annotation.label)}</text>\n`;
      }
    } else if (ann.kind === 'brace') {
      const style = ann.annotation.style;
      svgContent += `  <path data-annotation-id="${escapeXml(ann.annotation.id)}" data-annotation-kind="brace" d="${ann.geometry.pathD}" fill="none" stroke="${escapeXml(style?.color || '#64748b')}" stroke-width="${style?.strokeWidth ?? 2}" />\n`;
      if (ann.annotation.label) {
        svgContent += `  <text x="${ann.geometry.labelPosition.x}" y="${ann.geometry.labelPosition.y}" fill="${escapeXml(style?.color || '#64748b')}" font-family="${escapeXml(doc.theme?.fontFamily || 'sans-serif')}" font-size="12" text-anchor="${ann.geometry.side === 'right' ? 'start' : 'end'}">${escapeXml(ann.annotation.label)}</text>\n`;
      }
    }
  }

  // Render nodes
  scene.nodes.forEach((sn: SceneNode) => {
    const n = sn.node;
    const box = sn.box;
    const w = box.width;
    const h = box.height;
    const nx = box.x;
    const ny = box.y;
    const fontSize = n.style?.fontSize || 14;
    const fontFamily = sn.visuals.fontFamily;
    const rx = sn.visuals.borderRadius;
    const bg = sn.visuals.backgroundColor;
    const border = sn.visuals.borderColor;
    const textColor = sn.visuals.textColor;

    const shape = sn.visuals.shape;
    svgContent += `  <g id="${escapeXml(n.id)}" data-node-shape="${shape}">\n`;
    if (shape === 'diamond') svgContent += `    <polygon points="${nx + w / 2},${ny} ${nx + w},${ny + h / 2} ${nx + w / 2},${ny + h} ${nx},${ny + h / 2}" fill="${bg}" stroke="${border}" stroke-width="${sn.visuals.borderWidth}" />\n`;
    else if (shape === 'parallelogram') svgContent += `    <polygon points="${nx + 16},${ny} ${nx + w},${ny} ${nx + w - 16},${ny + h} ${nx},${ny + h}" fill="${bg}" stroke="${border}" stroke-width="${sn.visuals.borderWidth}" />\n`;
    else if (shape === 'circle') svgContent += `    <ellipse cx="${nx + w / 2}" cy="${ny + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${bg}" stroke="${border}" stroke-width="${sn.visuals.borderWidth}" />\n`;
    else svgContent += `    <rect x="${nx}" y="${ny}" width="${w}" height="${h}" rx="${shape === 'rectangle' ? 0 : shape === 'pill' ? h / 2 : rx}" fill="${bg}" stroke="${border}" stroke-width="${sn.visuals.borderWidth}" />\n`;

    // EX-11: embedded node image, self-contained via a data: URI so SVG/HTML
    // never reference a broken local asset:// path.
    if (sn.imageArea && n.assetRef) {
      const asset = assetStore?.getAsset(n.assetRef);
      if (asset) {
        const dataUri = `data:${asset.mimeType};base64,${bytesToBase64(asset.data)}`;
        svgContent += `    <image x="${sn.imageArea.x}" y="${sn.imageArea.y}" width="${sn.imageArea.width}" height="${sn.imageArea.height}" href="${dataUri}" preserveAspectRatio="xMidYMid meet" />\n`;
      }
    }

    const textTop = sn.imageArea ? sn.imageArea.y + sn.imageArea.height + 4 : ny;
    const textAreaHeight = sn.imageArea ? ny + h - textTop : h;
    const blockHeight = sn.lines.length * sn.lineHeight;
    const firstLineY = textTop + textAreaHeight / 2 - blockHeight / 2 + sn.lineHeight * 0.75;
    // EX-11: icon renders as an inline prefix on the first display line,
    // matching Canvas's inline icon-before-label placement without a new
    // node layout model.
    const iconPrefix = n.icon ? `${n.icon} ` : '';
    const tspans = sn.lines
      .map((line, i) => `<tspan x="${nx + w / 2}" y="${firstLineY + i * sn.lineHeight}">${escapeXml(i === 0 ? iconPrefix + line : line)}</tspan>`)
      .join('');
    svgContent += `    <text fill="${textColor}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="500" text-anchor="middle">${tspans}</text>\n`;
    svgContent += `  </g>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
    <marker id="rel-arrow-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
    <marker id="rel-arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M8,0 L0,4 L8,8 z" fill="context-stroke" /></marker>
    ${backgroundDefs}
    <style>
      text { user-select: none; }
    </style>
  </defs>
  ${backgroundFill}
${svgContent}</svg>`;
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
/**
 * EX-07: canonical node text may contain explicit hard `\n` breaks (F6).
 * A literal physical newline inside an ordinary quoted Mermaid label is
 * parser/version-sensitive -- not a stable export contract. `<br/>` is
 * Mermaid's own supported, deterministic line-break representation inside
 * a label, so it survives regardless of whether a given renderer happens
 * to tolerate a raw embedded newline.
 */
function toMermaidLabel(text: string): string {
  return text
    .replace(/"/g, '&quot;')
    .split('\n')
    .join('<br/>');
}

export function exportToMermaid(doc: CanonicalDocument): string {
  const lines: string[] = [];
  lines.push('graph TD');

  const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');

  doc.nodes.forEach((n) => {
    const sId = sanitizeId(n.id);
    const escapedText = toMermaidLabel(n.text);

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
      lines.push(`  ${sSrc} -->|"${toMermaidLabel(e.label)}"| ${sTgt}`);
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
/**
 * EX-02: JSON Canvas 1.0 only accepts `#RRGGBB` or a preset "1".."6" for
 * `color` -- never invent a private encoding for colors the standard
 * cannot represent (e.g. rgba() with alpha).
 */
function toJsonCanvasColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
}

/** JSON Canvas edge `fromSide`/`toSide` accept exactly these four values. */
function toJsonCanvasSide(handle: string | undefined): 'top' | 'right' | 'bottom' | 'left' | undefined {
  return handle === 'top' || handle === 'right' || handle === 'bottom' || handle === 'left' ? handle : undefined;
}

/**
 * 7. JSON Canvas Open Specification Exporter (.canvas)
 *
 * EX-02: maps only the semantics the current public JSON Canvas 1.0
 * specification (https://jsoncanvas.org/spec/1.0/) can genuinely represent
 * -- ordinary text nodes, `group` nodes for `CanonicalGroup`, and edge
 * source/target/side/end/label/color. This is truthful high fidelity
 * within the target standard, not a private "lossless" extension: routing
 * curves, dashed stroke width, and other Gedankenfaden-only semantics the
 * standard has no field for are intentionally not encoded.
 */
export function exportToJSONCanvas(doc: CanonicalDocument): string {
  const textNodes = doc.nodes.map((n) => {
    const visuals = resolveNodeVisuals(n, doc.theme);
    return {
      id: n.id,
      type: 'text' as const,
      text: n.text,
      x: Math.round(n.geometry.x),
      y: Math.round(n.geometry.y),
      width: Math.round(n.geometry.width || 150),
      height: Math.round(n.geometry.height || 44),
      color: toJsonCanvasColor(visuals.backgroundColor),
    };
  });

  const groupNodes = doc.groups.map((group) => {
    const bounds = resolveGroupBounds(group, doc.nodes);
    return {
      id: `group_${group.id}`,
      type: 'group' as const,
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      label: group.title || undefined,
      color: toJsonCanvasColor(group.style?.borderColor),
    };
  });

  const canvasNodes = [...groupNodes, ...textNodes];

  const canvasEdges = doc.edges.map((e) => ({
    id: e.id,
    fromNode: e.source,
    fromSide: toJsonCanvasSide(e.sourceHandle),
    fromEnd: 'none' as const,
    toNode: e.target,
    toSide: toJsonCanvasSide(e.targetHandle),
    toEnd: e.style?.arrowEnd === false ? ('none' as const) : ('arrow' as const),
    color: toJsonCanvasColor(e.style?.stroke),
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
 * 8. Standalone Self-Contained HTML View (.html)
 *
 * EX-04: this is a self-contained, offline, viewable HTML document that
 * embeds the exported SVG -- not an interactive pan/zoom editor or an
 * interactive SVG application. It does not fetch network resources and
 * does not run a Gedankenfaden runtime; PRODUCT_SPEC/ARCHITECTURE describe
 * it the same way. Do not read this as an invitation to add interaction.
 */
export function exportToHTML(doc: CanonicalDocument, assets?: Map<string, Uint8Array>): string {
  const svg = exportToSVG(doc, assets);
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

export async function exportToPNG(doc: CanonicalDocument, assets?: Map<string, Uint8Array>): Promise<Uint8Array> { return rasterizeSvg(exportToSVG(doc, assets), 'image/png'); }

/**
 * 10. JPEG Exporter (.jpeg)
 * Produces binary JPEG buffer
 */
export async function exportToJPEG(doc: CanonicalDocument, assets?: Map<string, Uint8Array>): Promise<Uint8Array> { return rasterizeSvg(exportToSVG(doc, assets), 'image/jpeg'); }

/**
 * 11. PDF Document Exporter (.pdf)
 * Generates a printable PDF 1.4 vector diagram.
 */
export async function exportToPDF(doc: CanonicalDocument, assets?: Map<string, Uint8Array>): Promise<Uint8Array> {
  const assetStore = resolveAssetStore(assets);
  const scene = buildExportScene(doc, (n) => Boolean(n.assetRef && assetStore?.getAsset(n.assetRef)));

  const minX = scene.bounds.minX;
  const minY = scene.bounds.minY;
  const maxX = scene.bounds.maxX;
  const maxY = scene.bounds.maxY;
  const diagramWidth = Math.max(1, maxX - minX);
  const diagramHeight = Math.max(1, maxY - minY);
  const landscape = diagramWidth >= diagramHeight;
  const margin = 42;
  // EX-09: a fixed Letter page forced every diagram to shrink-to-fit, which
  // on a large real map crushed 14px text down to sub-1pt and produced a
  // geometry/text scale mismatch. Instead the page grows to the diagram at
  // a 1:1 canvas-unit-to-point baseline (never *upscaling* a small diagram
  // past a normal Letter/landscape page), bounded by a generous ceiling so
  // an extreme diagram degrades by a deterministic, documented scale-down
  // rather than growing the PDF unboundedly.
  const minPageWidth = landscape ? 792 : 612;
  const minPageHeight = landscape ? 612 : 792;
  const maxPagePoints = 14400; // 200in ceiling
  const pageWidth = Math.min(maxPagePoints, Math.max(minPageWidth, diagramWidth + margin * 2));
  const pageHeight = Math.min(maxPagePoints, Math.max(minPageHeight, diagramHeight + margin * 2));
  const scale = Math.min(1, (pageWidth - margin * 2) / diagramWidth, (pageHeight - margin * 2) / diagramHeight);
  const offsetX = (pageWidth - diagramWidth * scale) / 2;
  const offsetY = (pageHeight - diagramHeight * scale) / 2;
  const x = (value: number) => offsetX + (value - minX) * scale;
  const y = (value: number) => offsetY + (maxY - value) * scale;
  const boxById = new Map(scene.nodes.map((sn) => [sn.node.id, sn]));
  const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
  const content: string[] = ['1 J 1 j'];
  const unicodePlacements: PdfTextPlacement[] = [];
  const imagePlacements: PdfImagePlacement[] = [];

  const setStroke = (color: string, width: number, dashed = false) => {
    const [r, g, b] = pdfRgb(color);
    content.push(`${r} ${g} ${b} RG ${Math.max(0.5, width * scale)} w ${dashed ? '[6 4] 0 d' : '[] 0 d'}`);
  };
  const setFill = (color: string) => {
    const [r, g, b] = pdfRgb(color);
    content.push(`${r} ${g} ${b} rg`);
  };
  const anchor = (node: CanonicalNode, handle: string | undefined) => {
    const box = boxById.get(node.id)!.box;
    if (handle === 'left') return { x: box.x, y: box.y + box.height / 2 };
    if (handle === 'top') return { x: box.x + box.width / 2, y: box.y };
    if (handle === 'bottom') return { x: box.x + box.width / 2, y: box.y + box.height };
    return { x: box.x + box.width, y: box.y + box.height / 2 };
  };

  // EX-08: background fill + pattern, same projection SVG/Canvas use.
  setFill(scene.background.fill);
  content.push(`0 0 ${pageWidth} ${pageHeight} re f`);
  if (scene.background.pattern !== 'none') {
    const [pr, pg, pb] = pdfRgb(scene.background.patternColor);
    const gap = 22 * scale;
    if (gap > 2) {
      if (scene.background.pattern === 'dots') {
        content.push(`${pr} ${pg} ${pb} rg`);
        // A small filled square (`re f`) is a simple, guaranteed-visible PDF
        // dot -- a degenerate zero-height Bezier curve is not a real filled
        // shape and would render as nothing.
        const dotSize = Math.max(1, 1.2 * scale);
        for (let gx = offsetX % gap; gx < pageWidth; gx += gap) {
          for (let gy = offsetY % gap; gy < pageHeight; gy += gap) {
            content.push(`${gx - dotSize / 2} ${gy - dotSize / 2} ${dotSize} ${dotSize} re f`);
          }
        }
      } else {
        content.push(`${pr} ${pg} ${pb} RG 0.5 w [] 0 d`);
        for (let gx = offsetX % gap; gx < pageWidth; gx += gap) content.push(`${gx} 0 m ${gx} ${pageHeight} l S`);
        for (let gy = offsetY % gap; gy < pageHeight; gy += gap) content.push(`0 ${gy} m ${pageWidth} ${gy} l S`);
      }
    }
  }

  // EX-05: boundary annotations render as background regions, behind
  // groups/edges/nodes.
  for (const ann of scene.annotations) {
    if (ann.kind !== 'boundary') continue;
    const style = ann.annotation.style;
    const left = x(ann.box.x);
    const bottom = y(ann.box.y + ann.box.height);
    const width = ann.box.width * scale;
    const height = ann.box.height * scale;
    setFill(style?.fillColor || 'rgba(59,130,246,0.08)');
    setStroke(style?.borderColor || '#93c5fd', style?.borderWidth ?? 1.5, style?.borderStyle === 'dashed');
    content.push(`${left} ${bottom} ${width} ${height} re B`);
    if (ann.annotation.title) {
      setFill(style?.borderColor || '#3b82f6');
      drawPdfText(content, ann.annotation.title, left + 10 * scale, bottom + height - 18 * scale, 12 * scale, false, unicodePlacements, style?.borderColor || '#3b82f6');
    }
  }

  scene.groups.forEach(({ group, bounds }) => {
    const left = x(bounds.x);
    const bottom = y(bounds.y + bounds.height);
    const width = bounds.width * scale;
    const height = bounds.height * scale;
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

  // EX-05: relationship lines and braces, drawn above edges but before
  // nodes so node text stays readable on top.
  for (const ann of scene.annotations) {
    if (ann.kind === 'relationshipLine') {
      const style = ann.annotation.style;
      setStroke(style?.stroke || '#6366f1', style?.strokeWidth ?? 2, style?.lineStyle === 'dashed');
      content.push(`${svgPathToPdfPath(ann.geometry.pathD, x, y)} S`);
      if (ann.annotation.label) {
        drawPdfText(content, ann.annotation.label, x(ann.geometry.midPoint.x), y(ann.geometry.midPoint.y) + 6 * scale, 11 * scale, true, unicodePlacements, style?.stroke || '#6366f1');
      }
    } else if (ann.kind === 'brace') {
      const style = ann.annotation.style;
      setStroke(style?.color || '#64748b', style?.strokeWidth ?? 2);
      content.push(`${svgPathToPdfPath(ann.geometry.pathD, x, y)} S`);
      if (ann.annotation.label) {
        drawPdfText(content, ann.annotation.label, x(ann.geometry.labelPosition.x), y(ann.geometry.labelPosition.y), 11 * scale, false, unicodePlacements, style?.color || '#64748b');
      }
    }
  }

  scene.nodes.forEach((sn) => {
    const node = sn.node;
    const width = sn.box.width * scale;
    const height = sn.box.height * scale;
    const left = x(sn.box.x);
    const bottom = y(sn.box.y + sn.box.height);
    const shape = sn.visuals.shape;
    setFill(sn.visuals.backgroundColor);
    setStroke(sn.visuals.borderColor, sn.visuals.borderWidth);
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
      const radius = shape === 'pill' ? height / 2 : Math.min(sn.visuals.borderRadius * scale, width / 2, height / 2);
      const k = 0.5522847498;
      content.push(`${left + radius} ${bottom} m ${left + width - radius} ${bottom} l ${left + width - radius + k * radius} ${bottom} ${left + width} ${bottom + radius - k * radius} ${left + width} ${bottom + radius} c ${left + width} ${bottom + height - radius} l ${left + width} ${bottom + height - radius + k * radius} ${left + width - radius + k * radius} ${bottom + height} ${left + width - radius} ${bottom + height} c ${left + radius} ${bottom + height} l ${left + radius - k * radius} ${bottom + height} ${left} ${bottom + height - radius + k * radius} ${left} ${bottom + height - radius} c ${left} ${bottom + radius} l ${left} ${bottom + radius - k * radius} ${left + radius - k * radius} ${bottom} ${left + radius} ${bottom} c h B`);
    } else {
      content.push(`${left} ${bottom} ${width} ${height} re B`);
    }

    // EX-11: embedded node image, queued for the post-processing pass where
    // a real PDFDocument (needed to embed PNG/JPEG bytes) is available.
    if (sn.imageArea && node.assetRef) {
      const asset = assetStore?.getAsset(node.assetRef);
      if (asset) {
        const areaLeft = x(sn.imageArea.x);
        const areaBottom = y(sn.imageArea.y + sn.imageArea.height);
        imagePlacements.push({
          data: asset.data,
          mimeType: asset.mimeType,
          x: areaLeft,
          y: areaBottom,
          width: sn.imageArea.width * scale,
          height: sn.imageArea.height * scale,
        });
      }
    }

    // EX-09: PDF node text now shares the same text-aware wrap/geometry
    // seam as SVG/Canvas (sn.lines/sn.lineHeight from buildExportScene)
    // instead of drawing a single unwrapped line independent of the box.
    const textTop = sn.imageArea ? y(sn.box.y + (sn.imageArea.y - sn.box.y) + sn.imageArea.height + 4) : bottom + height;
    const textAreaHeight = sn.imageArea ? textTop - bottom : height;
    const textCenterY = bottom + textAreaHeight / 2;
    const lineHeightPt = sn.lineHeight * scale;
    const fontSizePt = (node.style?.fontSize || 14) * scale;
    const blockHeight = sn.lines.length * lineHeightPt;
    const firstLineY = textCenterY + blockHeight / 2 - lineHeightPt * 0.75;
    const iconPrefix = node.icon ? `${node.icon} ` : '';
    sn.lines.forEach((line, i) => {
      const lineText = i === 0 ? iconPrefix + line : line;
      drawPdfText(content, lineText, left + width / 2, firstLineY - i * lineHeightPt, fontSizePt, true, unicodePlacements, sn.visuals.textColor);
    });
  });

  const stream = `${content.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  return applyPdfOverlays(buildPdf(objects), unicodePlacements, imagePlacements);
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

/**
 * EX-11: the bundled Noto Sans SC embedded font stack covers Latin/CJK
 * ranges but not emoji/pictographic glyphs used as node icons. Returns
 * `null` for a codepoint the font stack cannot represent instead of
 * throwing -- callers deterministically drop just that glyph (a documented,
 * bounded limitation) rather than crashing the whole PDF export or
 * silently pretending an unsupported icon was rendered.
 */
export function notoSubsetFor(character: string): string | null {
  const codepoint = character.codePointAt(0) || 0;
  const subset = notoSansSubsets.find((candidate) => candidate.ranges.some(([start, end]) => codepoint >= start && codepoint <= end));
  return subset ? subset.name : null;
}

/**
 * Post-processes the raw content-stream PDF with everything that needs a
 * real `PDFDocument`/page object: Unicode text runs (embedded Noto Sans SC)
 * and embedded raster images (EX-11). Both go through pdf-lib in one load
 * pass so image embedding doesn't need a second document round-trip.
 */
async function applyPdfOverlays(
  pdfBytes: Uint8Array,
  placements: PdfTextPlacement[],
  imagePlacements: PdfImagePlacement[] = []
): Promise<Uint8Array> {
  if (placements.length === 0 && imagePlacements.length === 0) return pdfBytes;
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
      if (!subset) continue; // EX-11: deterministically drop an unsupported glyph (e.g. emoji icon), never the whole label.
      const current = runs.at(-1);
      if (current?.subset === subset) current.text += character;
      else runs.push({ subset, text: character });
    }
    if (runs.length === 0) continue;
    for (const run of runs) run.font = await getFont(run.subset);
    const totalWidth = runs.reduce((width, run) => width + run.font!.widthOfTextAtSize(run.text, placement.size), 0);
    let cursor = placement.centered ? placement.x - totalWidth / 2 : placement.x;
    const [r, g, b] = pdfRgb(placement.color).map(Number);
    for (const run of runs) {
      page.drawText(run.text, { x: cursor, y: placement.y, size: placement.size, font: run.font, color: rgb(r, g, b) });
      cursor += run.font!.widthOfTextAtSize(run.text, placement.size);
    }
  }

  for (const placement of imagePlacements) {
    let image: PDFImage | undefined;
    try {
      const mime = placement.mimeType.toLowerCase();
      if (mime.includes('png')) image = await pdf.embedPng(placement.data);
      else if (mime.includes('jpeg') || mime.includes('jpg')) image = await pdf.embedJpg(placement.data);
      // Other formats (e.g. SVG assets) are a documented, bounded PDF
      // limitation: skipped deterministically rather than faked.
    } catch {
      // EX-11: missing/corrupt asset data degrades explicitly by skipping
      // just this image, never crashing the export or dropping other content.
      image = undefined;
    }
    if (!image) continue;
    const fitScale = Math.min(placement.width / image.width, placement.height / image.height);
    const drawWidth = image.width * fitScale;
    const drawHeight = image.height * fitScale;
    page.drawImage(image, {
      x: placement.x + (placement.width - drawWidth) / 2,
      y: placement.y + (placement.height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
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
