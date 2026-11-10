"use client";

import { useState, useEffect } from "react";
import { ChartType } from "@prisma/client";
import {
  MetricType,
  PipelineFilterOption,
  DashboardWidgetData,
  CreateWidgetInput,
  UpdateWidgetInput,
} from "../types";
import {
  X,
  Plus,
  Save,
  Trash2,
  TrendingUp,
  BarChart2,
  PieChart as PieIcon,
  Hash,
  Layers,
  Sparkles,
} from "lucide-react";

interface WidgetBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelines: PipelineFilterOption[];
  editingWidget: DashboardWidgetData | null;
  onSaveWidget: (input: CreateWidgetInput | UpdateWidgetInput) => Promise<void>;
  onDeleteWidget?: (id: string) => Promise<void>;
}

export function WidgetBuilderModal({
  isOpen,
  onClose,
  pipelines,
  editingWidget,
  onSaveWidget,
  onDeleteWidget,
}: WidgetBuilderModalProps) {
  const [title, setTitle] = useState("");
  const [metricType, setMetricType] = useState<MetricType>("REVENUE");
  const [chartType, setChartType] = useState<ChartType>(ChartType.LINE);
  const [pipelineId, setPipelineId] = useState<string>("ALL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (editingWidget) {
      setTitle(editingWidget.title);
      setMetricType(editingWidget.metricType);
      setChartType(editingWidget.chartType);
      setPipelineId(editingWidget.config.pipelineId || "ALL");
    } else {
      setTitle("");
      setMetricType("REVENUE");
      setChartType(ChartType.LINE);
      setPipelineId("ALL");
    }
  }, [editingWidget, isOpen]);

  if (!isOpen) return null;

  // Auto-fill suggested title if user changes metric and hasn't customized title
  const handleMetricSelect = (m: MetricType) => {
    setMetricType(m);
    if (!title || title.includes("Выручка") || title.includes("лиды") || title.includes("этапам") || title.includes("менеджерам")) {
      if (m === "REVENUE") setTitle("Доход за период (KZT)");
      if (m === "LEADS") setTitle("Новые лиды за период");
      if (m === "DEALS_BY_STAGE") setTitle("Сделки по этапам воронки");
      if (m === "DEALS_BY_MANAGER") setTitle("Сделки по менеджерам");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const targetPipelineId = pipelineId === "ALL" ? null : pipelineId;

    if (editingWidget) {
      await onSaveWidget({
        id: editingWidget.id,
        title: title.trim() || "Аналитический виджет",
        metricType,
        chartType,
        pipelineId: targetPipelineId,
      });
    } else {
      await onSaveWidget({
        title: title.trim() || "Новый виджет",
        metricType,
        chartType,
        pipelineId: targetPipelineId,
      });
    }

    setIsSubmitting(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!editingWidget || !onDeleteWidget) return;
    if (!confirm("Удалить этот виджет с дашборда?")) return;

    setIsDeleting(true);
    await onDeleteWidget(editingWidget.id);
    setIsDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {editingWidget ? "Настройка виджета" : "Конструктор виджета дашборда"}
              </h3>
              <p className="text-[11px] text-slate-500">
                Выберите метрику, воронку и способ визуализации данных
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 1. Title Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Название виджета *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Выручка по дням"
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold"
            />
          </div>

          {/* 2. Metric Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Аналитическая метрика
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleMetricSelect("REVENUE")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  metricType === "REVENUE"
                    ? "bg-emerald-50/70 border-emerald-500 text-emerald-950 font-bold shadow-xs"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Доход (Выручка)</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Сумма оплат в тенге (₸)
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleMetricSelect("LEADS")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  metricType === "LEADS"
                    ? "bg-blue-50/70 border-blue-500 text-blue-950 font-bold shadow-xs"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Новые лиды</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Количество новых обращений
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleMetricSelect("DEALS_BY_STAGE")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  metricType === "DEALS_BY_STAGE"
                    ? "bg-purple-50/70 border-purple-500 text-purple-950 font-bold shadow-xs"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>Сделки по этапам</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Распределение по статусам
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleMetricSelect("DEALS_BY_MANAGER")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  metricType === "DEALS_BY_MANAGER"
                    ? "bg-amber-50/70 border-amber-500 text-amber-950 font-bold shadow-xs"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Сделки по менеджерам</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Эффективность команды
                </p>
              </button>
            </div>
          </div>

          {/* 3. Pipeline Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Фильтр по воронке
            </label>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold cursor-pointer"
            >
              <option value="ALL">Все воронки продаж</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isDefault ? "(Основная)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Chart Visualization Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Тип визуализации (Recharts)
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setChartType(ChartType.NUMBER)}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  chartType === ChartType.NUMBER
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <Hash className="w-4 h-4" />
                <span className="text-[11px] font-bold">Число</span>
              </button>

              <button
                type="button"
                onClick={() => setChartType(ChartType.LINE)}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  chartType === ChartType.LINE
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span className="text-[11px] font-bold">Линия (Line)</span>
              </button>

              <button
                type="button"
                onClick={() => setChartType(ChartType.BAR)}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  chartType === ChartType.BAR
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                <span className="text-[11px] font-bold">Столбцы (Bar)</span>
              </button>

              <button
                type="button"
                onClick={() => setChartType(ChartType.PIE)}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                  chartType === ChartType.PIE
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <PieIcon className="w-4 h-4" />
                <span className="text-[11px] font-bold">Круг (Pie)</span>
              </button>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            {editingWidget ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить виджет</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{editingWidget ? "Сохранить изменения" : "Добавить виджет"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
