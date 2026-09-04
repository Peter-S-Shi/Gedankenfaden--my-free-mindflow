import React, { useState } from 'react';
import { CanonicalDocument } from '../model/types';
import { Plus, Network, GitFork, Folder, Clock, FileText, Search, AlertTriangle, RotateCcw, X } from 'lucide-react';
import { CrashDetectionResult } from '../model/recovery';

interface LibraryHomeProps {
  onOpenDocument: (doc: CanonicalDocument) => void;
  onCreateNew: (mode: 'mindmap' | 'flowchart') => void;
  recentDocuments: CanonicalDocument[];
  crashRecovery?: CrashDetectionResult | null;
  onRestoreCrashSnapshot?: () => void;
  onDismissCrashRecovery?: () => void;
}

export const LibraryHome: React.FC<LibraryHomeProps> = ({
  onOpenDocument,
  onCreateNew,
  recentDocuments,
  crashRecovery,
  onRestoreCrashSnapshot,
  onDismissCrashRecovery,
}) => {
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModeFilter, setSelectedModeFilter] = useState<'all' | 'mindmap' | 'flowchart'>('all');

  const filteredDocs = recentDocuments.filter((doc) => {
    if (selectedModeFilter !== 'all' && doc.mode !== selectedModeFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = doc.title.toLowerCase().includes(q);
    const nodeMatch = doc.nodes.some((n) => n.text.toLowerCase().includes(q));
    return titleMatch || nodeMatch;
  });

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-y-auto">
      {/* Top Header */}
      <header className="px-10 py-6 border-b border-slate-200/80 bg-white/70 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-800 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
            Gedankenfaden
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            A free, local-first Windows desktop workspace for mind maps and flowcharts
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onCreateNew('mindmap')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-medium shadow-sm transition-all hover:shadow"
          >
            <Plus size={16} />
            New Mind Map
          </button>
          <button
            onClick={() => onCreateNew('flowchart')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 active:bg-black text-white rounded-lg text-sm font-medium shadow-sm transition-all hover:shadow"
          >
            <GitFork size={16} />
            New Flowchart
          </button>
        </div>
      </header>

      {/* Crash Recovery Notification Banner */}
      {crashRecovery?.hasUnsavedOrCrash && (
        <div className="bg-amber-50 border-b border-amber-200 px-10 py-3 flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900">
                Crash Recovery: Unsaved Session Detected
              </div>
              <div className="text-xs text-amber-700">
                Gedankenfaden detected an abnormal shutdown with unsaved changes for "
                <span className="font-semibold">{crashRecovery.uncleanSession?.activeDocTitle || 'Untitled'}</span>
                " ({crashRecovery.latestSnapshot ? new Date(crashRecovery.latestSnapshot.timestamp).toLocaleTimeString() : 'Recent snapshot'}).
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRestoreCrashSnapshot && (
              <button
                onClick={onRestoreCrashSnapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <RotateCcw size={13} />
                Restore Unsaved Version
              </button>
            )}
            {onDismissCrashRecovery && (
              <button
                onClick={onDismissCrashRecovery}
                className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                title="Dismiss"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-6xl w-full mx-auto px-10 py-8 flex flex-col gap-8">
        {/* Folders & Collections Overview */}
        <section>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            <Folder size={14} />
            Local Collections
          </div>
          <div className="grid grid-cols-4 gap-4">
            {['Architecture Probes', 'Study & Reading Notes', 'Workflow Pipelines', 'Product Ideas'].map((folder) => (
              <div
                key={folder}
                className="p-3.5 bg-white border border-slate-200/70 rounded-xl hover:border-slate-300 transition-all flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Folder size={16} />
                </div>
                <div className="truncate">
                  <div className="text-sm font-medium text-slate-700 truncate">{folder}</div>
                  <div className="text-xs text-slate-400">Local folder</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Filter & Search Bar */}
        <section className="flex items-center justify-between gap-4 pt-2">
          <div className="flex items-center bg-slate-200/60 p-1 rounded-xl gap-1">
            <button
              onClick={() => setSelectedModeFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                selectedModeFilter === 'all'
                  ? 'bg-white text-slate-800 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Documents
            </button>
            <button
              onClick={() => setSelectedModeFilter('mindmap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                selectedModeFilter === 'mindmap'
                  ? 'bg-white text-blue-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Network size={12} />
              Mind Maps
            </button>
            <button
              onClick={() => setSelectedModeFilter('flowchart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                selectedModeFilter === 'flowchart'
                  ? 'bg-white text-emerald-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitFork size={12} />
              Flowcharts
            </button>
          </div>

          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library titles and nodes..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </section>

        {/* Signature Motion: Library Focus Grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Clock size={14} />
              Recent Documents (Signature Motion: Focus & Recede)
            </div>
            <div className="text-xs text-slate-400">
              {filteredDocs.length} {filteredDocs.length === 1 ? 'document' : 'documents'} found
            </div>
          </div>

          <div
            className="grid grid-cols-3 gap-6 group/library-grid"
            data-testid="library-card-grid"
          >
            {filteredDocs.map((doc) => {
              const isHovered = hoveredDocId === doc.id;
              const isAnyHovered = hoveredDocId !== null;
              const isReceded = isAnyHovered && !isHovered;

              return (
                <div
                  key={doc.id}
                  data-testid={`doc-card-${doc.id}`}
                  onMouseEnter={() => setHoveredDocId(doc.id)}
                  onMouseLeave={() => setHoveredDocId(null)}
                  onClick={() => onOpenDocument(doc)}
                  className={`relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-48 select-none ${
                    isHovered
                      ? 'bg-white border-blue-500 shadow-xl shadow-blue-500/10 -translate-y-1 scale-[1.02] z-10'
                      : isReceded
                      ? 'bg-white/80 border-slate-200/60 opacity-60 scale-[0.98]'
                      : 'bg-white border-slate-200/80 shadow-sm hover:border-slate-300'
                  }`}
                  style={{
                    transformOrigin: 'center center',
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          doc.mode === 'mindmap'
                            ? isHovered
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-50 text-blue-700'
                            : isHovered
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {doc.mode === 'mindmap' ? <Network size={12} /> : <GitFork size={12} />}
                        {doc.mode === 'mindmap' ? 'Mind Map' : 'Flowchart'}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <FileText size={12} />
                        {doc.nodes.length} nodes
                      </span>
                    </div>

                    <h3
                      className={`font-semibold text-base tracking-tight transition-colors ${
                        isHovered ? 'text-blue-900' : 'text-slate-800'
                      }`}
                    >
                      {doc.title}
                    </h3>

                    <p className="text-xs text-slate-500 line-clamp-2 mt-1.5">
                      {doc.nodes.map((n) => n.text).slice(0, 3).join(' → ') || 'Empty graph'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>Updated {new Date(doc.updatedAt).toLocaleTimeString()}</span>
                    <span className={`font-medium ${isHovered ? 'text-blue-600' : 'text-slate-500'}`}>
                      Open Canvas →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};
