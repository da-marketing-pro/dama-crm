"use client";

import { useState, useEffect } from "react";
import { StageWithDeals } from "../types";
import { createStage, updateStage, deleteStage, reorderStages } from "../actions";
import { StageType } from "@prisma/client";
import {
  X,
  Settings,
  Plus,
  Trash2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from "lucide-react";

interface PipelineSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
  pipelineName: string;
  stages: StageWithDeals[];
  isAdmin: boolean;
  onUpdated?: () => void;
}

const COLOR_PRESETS = [
  "#94A3B8", // slate
  "#38BDF8", // sky
  "#3B82F6", // blue
  "#818CF8", // indigo
  "#A855F7", // purple
  "#EC4899", // pink
  "#F59E0B", // amber
  "#10B981", // emerald
  "#EF4444", // rose
];

export function PipelineSettingsModal({
  isOpen,
  onClose,
  pipelineId,
  pipelineName,
  stages,
  isAdmin,
  onUpdated,
}: PipelineSettingsModalProps) {
  const [stageList, setStageList] = useState<StageWithDeals[]>(stages);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#3B82F6");
  const [newStageType, setNewStageType] = useState<StageType>(StageType.OPEN);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    setStageList(stages);
  }, [stages]);

  if (!isOpen || !isAdmin) return null;

  const handleCreateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim()) return;

    setLoading(true);
    setError(null);

    const res = await createStage(pipelineId, {
      name: newStageName.trim(),
      color: newStageColor,
      type: newStageType,
    });

    setLoading(false);
    if (!res.success) {
      setError(res.error || "Ошибка добавления этапа");
    } else {
      setNewStageName("");
      if (onUpdated) onUpdated();
    }
  };

  const handleUpdateStage = async (stageId: string, updates: any) => {
    setError(null);
    const res = await updateStage(stageId, updates);
    if (!res.success) {
      setError(res.error || "Ошибка обновления этапа");
    } else if (onUpdated) {
      onUpdated();
    }
  };

  const handleDeleteStage = async (stageId: string, stageName: string) => {
    if (!confirm(`Удалить этап «${stageName}»?`)) return;
    setError(null);
    const res = await deleteStage(stageId);
    if (!res.success) {
      setError(res.error || "Ошибка удаления");
    } else if (onUpdated) {
      onUpdated();
    }
  };

  // Reorder functions
  const saveNewOrder = async (updatedList: StageWithDeals[]) => {
    setStageList(updatedList);
    const stageIds = updatedList.map((s) => s.id);
    const res = await reorderStages(pipelineId, stageIds);
    if (!res.success) {
      setError(res.error || "Ошибка изменения порядка");
    } else if (onUpdated) {
      onUpdated();
    }
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const copy = [...stageList];
    const temp = copy[index];
    copy[index] = copy[index - 1];
    copy[index - 1] = temp;
    saveNewOrder(copy);
  };

  const handleMoveDown = (index: number) => {
    if (index >= stageList.length - 1) return;
    const copy = [...stageList];
    const temp = copy[index];
    copy[index] = copy[index + 1];
    copy[index + 1] = temp;
    saveNewOrder(copy);
  };

  // HTML5 Drag and Drop for stage rows
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }
    const copy = [...stageList];
    const [movedItem] = copy.splice(draggedIndex, 1);
    copy.splice(targetIndex, 0, movedItem);
    setDraggedIndex(null);
    saveNewOrder(copy);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Настройка этапов и порядка колонок
              </h3>
              <p className="text-xs text-slate-500">Воронка: «{pipelineName}»</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Add Stage Form */}
          <form
            onSubmit={handleCreateStage}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              Добавить новый этап в воронку
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="block text-[11px] text-slate-600 mb-1">
                  Название этапа *
                </label>
                <input
                  type="text"
                  required
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Например: Выставлен счет"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] text-slate-600 mb-1">Тип этапа</label>
                <select
                  value={newStageType}
                  onChange={(e) => setNewStageType(e.target.value as StageType)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white font-medium"
                >
                  <option value="OPEN">В работе (OPEN)</option>
                  <option value="WON">Успешно (WON)</option>
                  <option value="LOST">Провал (LOST)</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={loading || !newStageName.trim()}
                  className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              </div>
            </div>

            {/* Color Swatches */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-500">Цвет этапа:</span>
              <div className="flex items-center gap-1.5">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewStageColor(color)}
                    className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                      newStageColor === color
                        ? "scale-125 ring-2 ring-offset-1 ring-blue-500"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </form>

          {/* Current Stages List & Reordering */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Последовательность этапов ({stageList.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Используйте стрелки ↑ ↓ или перетаскивайте за ручку
              </span>
            </div>

            <div className="space-y-2">
              {stageList.map((stage, index) => {
                const isFirst = index === 0;
                const isLast = index === stageList.length - 1;

                return (
                  <div
                    key={stage.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    className={`flex items-center justify-between p-2.5 rounded-xl bg-white border text-xs shadow-2xs gap-2.5 transition-all ${
                      draggedIndex === index
                        ? "border-blue-400 bg-blue-50/50 opacity-60"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {/* Reorder controls & Order number */}
                    <div className="flex items-center gap-1 shrink-0">
                      <div
                        className="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                        title="Перетащите для изменения порядка"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={() => handleMoveUp(index)}
                          className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20 disabled:hover:text-slate-400 rounded transition-colors cursor-pointer"
                          title="Поднять выше (влево в Канбане)"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => handleMoveDown(index)}
                          className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-20 disabled:hover:text-slate-400 rounded transition-colors cursor-pointer"
                          title="Опустить ниже (вправо в Канбане)"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="w-5 text-center font-mono font-bold text-slate-400 text-[11px]">
                        {index + 1}
                      </span>
                    </div>

                    {/* Color and Name */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <input
                        type="color"
                        value={stage.color}
                        onChange={(e) => handleUpdateStage(stage.id, { color: e.target.value })}
                        className="w-5 h-5 rounded-md cursor-pointer border-0 bg-transparent shrink-0"
                        title="Сменить цвет"
                      />

                      <input
                        type="text"
                        defaultValue={stage.name}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== stage.name) {
                            handleUpdateStage(stage.id, { name: e.target.value.trim() });
                          }
                        }}
                        className="px-2 py-1 rounded-lg border border-transparent hover:border-slate-300 focus:border-blue-500 font-semibold text-slate-900 text-xs w-full focus:bg-slate-50"
                      />
                    </div>

                    {/* Stage Type & Actions */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <select
                        value={stage.type}
                        onChange={(e) =>
                          handleUpdateStage(stage.id, { type: e.target.value as StageType })
                        }
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border cursor-pointer ${
                          stage.type === "WON"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : stage.type === "LOST"
                            ? "bg-rose-50 text-rose-800 border-rose-300"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        <option value="OPEN">В работе</option>
                        <option value="WON">Успешно (WON)</option>
                        <option value="LOST">Закрыто (LOST)</option>
                      </select>

                      <span className="text-slate-400 text-[10px] min-w-[50px] text-right">
                        {stage.deals.length} сдел.
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDeleteStage(stage.id, stage.name)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                        title="Удалить этап"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <span className="text-[11px] text-slate-500">
            Порядок этапов сразу сохраняется и обновляет колонки Канбана
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
