"use client";

import { useState } from "react";
import { PeriodOption, PipelineFilterOption } from "../types";
import { Currency } from "@prisma/client";
import {
  Calendar,
  Filter,
  Plus,
  RefreshCw,
  Sliders,
  ChevronDown,
  Layers,
  Sparkles,
} from "lucide-react";

interface DashboardHeaderProps {
  period: PeriodOption;
  onPeriodChange: (p: PeriodOption) => void;
  dateFrom: string;
  setDateFrom: (d: string) => void;
  dateTo: string;
  setDateTo: (d: string) => void;
  selectedPipelineId?: string;
  onPipelineChange: (id?: string) => void;
  pipelines: PipelineFilterOption[];
  onOpenAddWidget: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  baseCurrency?: Currency;
}

export function DashboardHeader({
  period,
  onPeriodChange,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  selectedPipelineId,
  onPipelineChange,
  pipelines,
  onOpenAddWidget,
  onRefresh,
  isRefreshing = false,
  baseCurrency = Currency.USD,
}: DashboardHeaderProps) {
  const [showCustomDates, setShowCustomDates] = useState(period === "custom");

  const handlePeriodSelect = (p: PeriodOption) => {
    onPeriodChange(p);
    setShowCustomDates(p === "custom");
  };

  const currencyBadge =
    baseCurrency === Currency.USD
      ? "$ USD"
      : baseCurrency === Currency.RUB
      ? "₽ RUB"
      : "₸ KZT";

  return (
    <div className="space-y-4 pb-2 border-b border-slate-200">
      {/* Top Title & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Аналитический Дашборд
            </h1>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold">
              BI Аналитика ({currencyBadge})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ключевые показатели эффективности, воронки продаж и настраиваемые аналитические виджеты
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200"
            title="Обновить аналитику"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={onOpenAddWidget}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>+ Добавить виджет / Настроить дашборд</span>
          </button>
        </div>
      </div>

      {/* Control Filters Bar: Period Switcher & Pipeline Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Period Switcher */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => handlePeriodSelect("7d")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === "7d"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              7 дней
            </button>
            <button
              type="button"
              onClick={() => handlePeriodSelect("30d")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === "30d"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30 дней
            </button>
            <button
              type="button"
              onClick={() => handlePeriodSelect("custom")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                period === "custom"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Пользовательский период</span>
            </button>
          </div>

          {/* Custom Date Pickers */}
          {showCustomDates && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl text-xs animate-in fade-in duration-150">
              <span className="text-[11px] text-slate-500 pl-1.5">От:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1 bg-white rounded-lg border border-slate-200 text-xs font-medium focus:outline-none"
              />
              <span className="text-[11px] text-slate-500">До:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 bg-white rounded-lg border border-slate-200 text-xs font-medium focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Pipeline Selector Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">Воронка:</span>
          </div>

          <div className="relative">
            <select
              value={selectedPipelineId || "ALL"}
              onChange={(e) =>
                onPipelineChange(e.target.value === "ALL" ? undefined : e.target.value)
              }
              className="text-xs font-semibold px-3 py-1.5 pr-8 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer appearance-none shadow-xs"
            >
              <option value="ALL">Все воронки продаж</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isDefault ? "(Основная)" : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
