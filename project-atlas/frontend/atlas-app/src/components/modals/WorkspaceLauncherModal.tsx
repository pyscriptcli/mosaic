'use client';

import React, { useState } from 'react';
import { FolderOpen, Plus, Trash2, Edit3, X, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useMapStore } from '../../store/useMapStore';

export const WorkspaceLauncherModal: React.FC = () => {
  const { activePanels, togglePanel } = useMapStore();
  const {
    projects,
    currentProjectId,
    createProject,
    loadProject,
    deleteProject,
    updateProjectName,
    isLoading,
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing');
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (!activePanels.launcher) return null;

  const handleCreate = async () => {
    const created = await createProject(newProjectName.trim() || undefined);
    if (created) {
      setNewProjectName('');
      togglePanel('launcher', false);
    }
  };

  const handleSelectProject = (p: any) => {
    loadProject(p);
    togglePanel('launcher', false);
  };

  const handleSaveRename = async (id: string) => {
    if (editingName.trim()) {
      await updateProjectName(id, editingName.trim());
      setEditingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[rgba(9,16,24,0.98)] border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-xs text-gray-300 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Project Atlas</h2>
            <p className="text-xs text-gray-400">Select or create a workspace</p>
          </div>
          <button
            onClick={() => togglePanel('launcher', false)}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Control */}
        <div className="flex bg-black/50 p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setActiveTab('existing')}
            className={`flex-1 py-2 rounded-xl font-bold text-xs transition ${
              activeTab === 'existing'
                ? 'bg-white/15 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Existing Workspaces
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-2 rounded-xl font-bold text-xs transition ${
              activeTab === 'new' ? 'bg-white/15 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            Create New
          </button>
        </div>

        {/* Existing Tab */}
        {activeTab === 'existing' && (
          <div className="max-h-72 overflow-y-auto pr-1 flex flex-col gap-2">
            {isLoading ? (
              <div className="py-8 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                <span>Loading workspaces...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No saved workspaces yet. Create your first one above!
              </div>
            ) : (
              projects.map((p) => {
                const isSelected = p.id === currentProjectId;
                const isEditing = editingId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div
                      onClick={() => !isEditing && handleSelectProject(p)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(p.id)}
                          autoFocus
                          className="bg-black/60 border border-sky-400 rounded-lg px-2 py-1 text-white text-xs w-full"
                        />
                      ) : (
                        <>
                          <div className="font-bold text-white text-sm truncate">{p.name}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Updated: {new Date(p.updated_at || p.created_at || '').toLocaleDateString()}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                      {isEditing ? (
                        <button
                          onClick={() => handleSaveRename(p.id)}
                          className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold"
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(p.id);
                            setEditingName(p.name);
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete workspace "${p.name}"?`)) {
                            deleteProject(p.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Create New Tab */}
        {activeTab === 'new' && (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Workspace Name
              </label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={`e.g. Untitled Project ${projects.length + 1}`}
                className="w-full bg-black/40 border border-white/15 rounded-2xl p-3 text-white placeholder-gray-500 outline-none focus:border-sky-400 text-sm"
              />
            </div>

            <button
              onClick={handleCreate}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-2xl shadow-lg shadow-blue-500/30 transition flex items-center justify-center gap-2 mt-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workspace</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
