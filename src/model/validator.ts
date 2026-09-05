import { CanonicalDocument } from './types';

export interface ValidationResult {
  valid: boolean;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateCanonicalDocument(doc: CanonicalDocument): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!doc) {
    return { valid: false, isValid: false, errors: ['Document is null or undefined'], warnings: [] };
  }

  if (doc.schemaVersion !== '1.0') {
    errors.push(`Unsupported schema version: ${doc.schemaVersion}. Expected '1.0'.`);
  }

  if (!doc.id || typeof doc.id !== 'string') {
    errors.push('Document must have a non-empty string ID.');
  }

  if (doc.mode !== 'mindmap' && doc.mode !== 'flowchart') {
    errors.push(`Invalid document mode: ${doc.mode}. Must be 'mindmap' or 'flowchart'.`);
  }

  if (!Array.isArray(doc.nodes)) {
    errors.push('Document nodes must be an array.');
    return { valid: false, isValid: false, errors, warnings };
  }

  if (!Array.isArray(doc.edges)) {
    errors.push('Document edges must be an array.');
    return { valid: false, isValid: false, errors, warnings };
  }

  const nodeMap = new Map<string, typeof doc.nodes[0]>();

  // Validate nodes
  doc.nodes.forEach((node, idx) => {
    if (!node.id || typeof node.id !== 'string') {
      errors.push(`Node at index ${idx} has invalid or missing ID.`);
      return;
    }
    if (nodeMap.has(node.id)) {
      errors.push(`Duplicate node ID detected: ${node.id}.`);
    }
    nodeMap.set(node.id, node);

    if (typeof node.text !== 'string') {
      errors.push(`Node ${node.id} text must be a string.`);
    }

    if (
      !node.geometry ||
      typeof node.geometry.x !== 'number' ||
      Number.isNaN(node.geometry.x) ||
      typeof node.geometry.y !== 'number' ||
      Number.isNaN(node.geometry.y)
    ) {
      errors.push(`Node ${node.id} has invalid coordinates.`);
    }
    if (node.geometry && typeof node.geometry.width === 'number' && node.geometry.width <= 0) {
      errors.push(`Node ${node.id} has non-positive width.`);
    }
    if (node.geometry && typeof node.geometry.height === 'number' && node.geometry.height <= 0) {
      errors.push(`Node ${node.id} has non-positive height.`);
    }
  });

  // Validate edges
  const edgeIds = new Set<string>();
  doc.edges.forEach((edge, idx) => {
    if (!edge.id || typeof edge.id !== 'string') {
      errors.push(`Edge at index ${idx} has invalid or missing ID.`);
      return;
    }
    if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate edge ID detected: ${edge.id}.`);
    }
    edgeIds.add(edge.id);

    if (!nodeMap.has(edge.source)) {
      errors.push(`Edge ${edge.id} references non-existent source node: ${edge.source}.`);
    }
    if (!nodeMap.has(edge.target)) {
      errors.push(`Edge ${edge.id} references non-existent target node: ${edge.target}.`);
    }
  });

  // Mode-specific validation
  if (doc.mode === 'mindmap' && doc.nodes.length > 0) {
    const rootNodes = doc.nodes.filter((n) => n.type === 'root' || !n.parentId);
    if (rootNodes.length === 0) {
      errors.push('Mind Map mode requires at least one central root node.');
    } else if (rootNodes.length > 1) {
      warnings.push(`Mind Map contains multiple root nodes (${rootNodes.length}). Preferred standard is 1 central topic.`);
    }

    // Verify parent-child cycle freedom
    doc.nodes.forEach((node) => {
      if (!node.parentId) return;
      if (!nodeMap.has(node.parentId)) {
        errors.push(`Node ${node.id} parentId '${node.parentId}' does not exist.`);
        return;
      }

      // Check ancestor chain for cycles
      const visited = new Set<string>([node.id]);
      let curr: string | undefined = node.parentId;
      while (curr) {
        if (visited.has(curr)) {
          errors.push(`Hierarchical cycle detected in Mind Map branch starting at node ${node.id}.`);
          break;
        }
        visited.add(curr);
        const parentNode = nodeMap.get(curr);
        curr = parentNode?.parentId;
      }
    });
  }

  // Validate groups if present
  if (Array.isArray(doc.groups)) {
    doc.groups.forEach((group) => {
      if (Array.isArray(group.nodeIds)) {
        group.nodeIds.forEach((nid) => {
          if (!nodeMap.has(nid)) {
            warnings.push(`Group '${group.title}' references non-existent node: ${nid}.`);
          }
        });
      }
    });
  }

  const isValid = errors.length === 0;
  return {
    valid: isValid,
    isValid,
    errors,
    warnings,
  };
}

export const validateDocumentInvariants = validateCanonicalDocument;
