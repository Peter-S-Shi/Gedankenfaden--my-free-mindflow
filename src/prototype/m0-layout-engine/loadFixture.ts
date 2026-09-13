/**
 * PROTOTYPE (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * Reuses the real, unmodified production importers (`importFromMarkdown` /
 * `importFromOPML`) purely to get a correct parentId hierarchy out of a
 * .md/.opml fixture -- then strips their geometry (which the production
 * importer only fills in by immediately calling the very layout engine
 * this gate is evaluating) and hands back plain `{id, parentId, text}`
 * input the prototypes size and position themselves.
 */
import { importFromMarkdown, importFromOPML } from '../../model/importers';
import { ProtoEdgeInput, ProtoNodeInput } from './treeUtils';

export interface LoadedFixture {
  nodes: ProtoNodeInput[];
  edges: ProtoEdgeInput[];
}

export function loadFixtureFromText(text: string, kind: 'md' | 'opml'): LoadedFixture {
  const doc = kind === 'md' ? importFromMarkdown(text) : importFromOPML(text);
  const nodes: ProtoNodeInput[] = doc.nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    text: n.text,
  }));
  const edges: ProtoEdgeInput[] = doc.edges.map((e) => ({ source: e.source, target: e.target }));
  return { nodes, edges };
}
