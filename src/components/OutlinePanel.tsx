import React, { useState, useMemo } from 'react';
import { CanonicalDocument, CanonicalNode } from '../model/types';
import { Search, ChevronRight, ChevronDown, CircleDot, PanelLeftClose } from 'lucide-react';

interface OutlinePanelProps {
  document: CanonicalDocument;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

interface TreeNode {
  node: CanonicalNode;
  children: TreeNode[];
}

export const OutlinePanel: React.FC<OutlinePanelProps> = ({
  document,
  selectedNodeId,
  onSelectNode,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Build tree hierarchy for Mind Map, or list/connected components for Flowchart
  const treeRoots = useMemo(() => {
    const nodeMap = new Map<string, TreeNode>();
    for (const node of document.nodes) {
      nodeMap.set(node.id, { node, children: [] });
    }

    const roots: TreeNode[] = [];

    // For mindmap mode or any node with parentId
    for (const node of document.nodes) {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId) && node.parentId !== node.id) {
        nodeMap.get(node.parentId)!.children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    }

    return roots;
  }, [document.nodes]);

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const renderTreeItem = (item: TreeNode, depth = 0) => {
    const isSelected = selectedNodeId === item.node.id;
    const isCollapsed = collapsedNodes.has(item.node.id);
    const hasChildren = item.children.length > 0;
    const isMatch = matchesSearch(item.node.text);

    // If searching and this item nor any children match, hide it
    if (searchQuery.trim()) {
      const anyChildMatch = (tn: TreeNode): boolean =>
        matchesSearch(tn.node.text) || tn.children.some(anyChildMatch);
      if (!isMatch && !item.children.some(anyChildMatch)) {
        return null;
      }
    }

    return (
      <div key={item.node.id} className="select-none">
        <div
          onClick={() => onSelectNode(item.node.id)}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs font-medium transition-colors ${
            isSelected
              ? 'bg-blue-50 text-blue-700 font-semibold'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleCollapse(item.node.id, e)}
              className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600"
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <CircleDot size={10} className="text-slate-300 ml-0.5 shrink-0" />
          )}

          <span className="truncate flex-1" title={item.node.text}>
            {item.node.text || 'Untitled'}
          </span>

          {item.node.type === 'root' && (
            <span className="text-[10px] px-1 py-0.2 bg-blue-100 text-blue-600 rounded">
              Root
            </span>
          )}
        </div>

        {hasChildren && !isCollapsed && (
          <div className="flex flex-col">
            {item.children.map((child) => renderTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="Document Outline"
      className="w-64 h-full bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 z-10 transition-all duration-200"
    >
      {/* Header */}
      <div className="h-12 px-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Outline
          </span>
          <span className="text-[11px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full font-semibold">
            {document.nodes.length}
          </span>
        </div>
        <button
          onClick={onClose}
          title="Collapse Outline (Ctrl+\)"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
          <Search size={13} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search outline..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-transparent border-none outline-none text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {treeRoots.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">No nodes in document</div>
        ) : (
          treeRoots.map((root) => renderTreeItem(root, 0))
        )}
      </div>

      {/* Footer shortcut tip */}
      <div className="px-3 py-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
        <span>Toggle Outline</span>
        <kbd className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-mono">
          Ctrl+\
        </kbd>
      </div>
    </aside>
  );
};
