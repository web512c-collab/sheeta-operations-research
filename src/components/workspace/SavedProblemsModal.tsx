/**
 * Sheeta Operations Research
 * Workspace Manager: Saved Problems CRUD & JSON Backup Export/Import
 */

import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { ORModuleType, SavedProblem } from '../../types';
import { useI18n } from '../../i18n/i18nContext';
import { usePlatform } from '../../platform';
import {
  deleteSavedProblem,
  exportWorkspaceJson,
  getSavedProblems,
  importWorkspaceJson,
  saveProblem,
} from '../../storage/db';
import {
  BookOpen,
  Calendar,
  Check,
  Download,
  FolderOpen,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';

interface SavedProblemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProblemData: any;
  activeModule: ORModuleType;
  onLoadProblem: (problem: SavedProblem) => void;
}

export const SavedProblemsModal: React.FC<SavedProblemsModalProps> = ({
  isOpen,
  onClose,
  activeProblemData,
  activeModule,
  onLoadProblem,
}) => {
  const { t } = useI18n();

  const [problems, setProblems] = useState<SavedProblem[]>([]);
  const platform = usePlatform();

  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');

  const [saveTitle, setSaveTitle] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [selectedIdToUpdate, setSelectedIdToUpdate] = useState<string | null>(null);

  const [problemToDelete, setProblemToDelete] = useState<SavedProblem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refreshProblems = async () => {
    const list = await getSavedProblems();
    setProblems(list);
    // Mirror to native mobile storage
    try {
      await platform.storage.syncNativeMirror({
        sheeta_or_saved_problems: JSON.stringify(list),
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshProblems();
      if (activeProblemData?.title) {
        setSaveTitle(activeProblemData.title);
      }
    }
  }, [isOpen, activeProblemData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveAsNew = async () => {
    if (!saveTitle.trim()) return;
    const newProblem: SavedProblem = {
      id: `prob_${Date.now()}`,
      title: saveTitle.trim(),
      module: activeModule,
      description: saveDesc.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: activeProblemData,
    };
    await saveProblem(newProblem);
    platform.device.haptic('success');
    showToast(t.workspace.saveSuccess);
    refreshProblems();
  };

  const handleUpdateExisting = async () => {
    if (!selectedIdToUpdate) return;
    const existing = problems.find((p) => p.id === selectedIdToUpdate);
    if (!existing) return;

    const updated: SavedProblem = {
      ...existing,
      title: saveTitle.trim() || existing.title,
      description: saveDesc.trim() || existing.description,
      updatedAt: new Date().toISOString(),
      data: activeProblemData,
    };
    await saveProblem(updated);
    platform.device.haptic('success');
    showToast(t.workspace.saveSuccess);
    refreshProblems();
  };

  const handleDelete = async () => {
    if (!problemToDelete) return;
    await deleteSavedProblem(problemToDelete.id);
    setProblemToDelete(null);
    platform.device.haptic('medium');
    showToast('Problem deleted.');
    refreshProblems();
  };

  const handleExportJson = async () => {
    try {
      const jsonStr = await exportWorkspaceJson();
      const filename = `sheeta_or_workspace_backup_${new Date().toISOString().slice(0, 10)}.json`;
      const res = await platform.file.exportFile({
        filename,
        content: jsonStr,
        mimeType: 'application/json;charset=utf-8',
      });
      if (res.success) {
        showToast(t.workspace.exportSuccess);
        platform.device.haptic('success');
      }
    } catch {
      showToast('Export failed.');
    }
  };

  const handleImportJson = async () => {
    try {
      const res = await platform.file.importFile({
        accept: '.json,application/json',
        extensions: ['json'],
      });
      if (!res) return;
      const countRes = await importWorkspaceJson(res.content);
      showToast(`Imported ${countRes.count} problems successfully.`);
      platform.device.haptic('success');
      refreshProblems();
    } catch {
      showToast(t.workspace.invalidJson);
    }
  };

  const filteredProblems = problems.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    const matchesMod = filterModule === 'all' || p.module === filterModule;
    return matchesSearch && matchesMod;
  });

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t.workspace.title} maxWidth="max-w-4xl">
        <div className="space-y-6">
          {toastMessage && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Save Active Problem Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Save Active Problem to Workspace
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder={t.workspace.problemName}
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              />
              <input
                type="text"
                placeholder={t.workspace.problemDesc}
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveAsNew}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.actions.saveAsNew}</span>
                </button>
                {selectedIdToUpdate && (
                  <button
                    onClick={handleUpdateExisting}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{t.actions.update}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Backup Import / Export */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t.actions.exportJson}</span>
              </button>

              <button
                onClick={handleImportJson}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.actions.importJson}</span>
              </button>
            </div>

            {/* Filter and Search */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search saved problems..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-8 pe-3 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg w-44"
                />
              </div>

              <select
                value={filterModule}
                onChange={(e) => setFilterModule(e.target.value)}
                className="px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value="all">All Modules</option>
                <option value="lp">Linear & IP</option>
                <option value="transportation">Transportation</option>
                <option value="pert">PERT / CPM</option>
                <option value="queuing_eoq">Queue & EOQ</option>
              </select>
            </div>
          </div>

          {/* Problems List */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {filteredProblems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {t.workspace.noSavedProblems}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-72 overflow-y-auto">
                {filteredProblems.map((prob) => (
                  <div
                    key={prob.id}
                    className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {prob.title}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {prob.module}
                        </span>
                      </div>
                      {prob.description && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {prob.description}
                        </p>
                      )}
                      <span className="text-[10px] text-slate-400 block mt-1">
                        Modified: {new Date(prob.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          onLoadProblem(prob);
                          setSelectedIdToUpdate(prob.id);
                          setSaveTitle(prob.title);
                          setSaveDesc(prob.description);
                          onClose();
                        }}
                        className="px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-md transition-colors flex items-center gap-1"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>{t.actions.load}</span>
                      </button>

                      <button
                        onClick={() => setProblemToDelete(prob)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {problemToDelete && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setProblemToDelete(null)}
          onConfirm={handleDelete}
          title="Delete Saved Problem"
          message={t.workspace.deleteConfirm}
        />
      )}
    </>
  );
};
