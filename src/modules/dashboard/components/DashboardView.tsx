"use client";

import { useState, useCallback } from "react";
import {
  PeriodOption,
  KpiMetrics,
  PipelineFilterOption,
  DashboardWidgetData,
  CreateWidgetInput,
  UpdateWidgetInput,
} from "../types";
import { Currency } from "@prisma/client";
import { DashboardHeader } from "./DashboardHeader";
import { KpiCards } from "./KpiCards";
import { WidgetGrid } from "./WidgetGrid";
import { WidgetBuilderModal } from "./WidgetBuilderModal";
import {
  getDashboardData,
  createDashboardWidget,
  updateDashboardWidget,
  deleteDashboardWidget,
} from "../actions";

interface DashboardViewProps {
  initialKpis: KpiMetrics;
  initialWidgets: DashboardWidgetData[];
  pipelines: PipelineFilterOption[];
  initialPeriod: PeriodOption;
  initialPipelineId?: string;
  baseCurrency?: Currency;
  startDate: string;
  endDate: string;
}

export function DashboardView({
  initialKpis,
  initialWidgets,
  pipelines,
  initialPeriod,
  initialPipelineId,
  startDate,
  endDate,
}: DashboardViewProps) {
  const [period, setPeriod] = useState<PeriodOption>(initialPeriod);
  const [dateFrom, setDateFrom] = useState(startDate.split("T")[0]);
  const [dateTo, setDateTo] = useState(endDate.split("T")[0]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>(
    initialPipelineId
  );

  const [kpis, setKpis] = useState<KpiMetrics>(initialKpis);
  const [widgets, setWidgets] = useState<DashboardWidgetData[]>(initialWidgets);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidgetData | null>(null);

  // Refresh or update data with filters
  const fetchData = useCallback(
    async (
      p: PeriodOption = period,
      pId: string | undefined = selectedPipelineId,
      dFrom: string = dateFrom,
      dTo: string = dateTo
    ) => {
      setIsRefreshing(true);
      try {
        const result = await getDashboardData({
          period: p,
          pipelineId: pId,
          dateFrom: p === "custom" ? dFrom : undefined,
          dateTo: p === "custom" ? dTo : undefined,
        });

        setKpis(result.kpis);
        setWidgets(result.widgets);
      } catch (err) {
        console.error("Dashboard refresh error:", err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [period, selectedPipelineId, dateFrom, dateTo]
  );

  const handlePeriodChange = (newPeriod: PeriodOption) => {
    setPeriod(newPeriod);
    fetchData(newPeriod, selectedPipelineId, dateFrom, dateTo);
  };

  const handlePipelineChange = (pId?: string) => {
    setSelectedPipelineId(pId);
    fetchData(period, pId, dateFrom, dateTo);
  };

  const handleCustomDateApply = () => {
    if (period === "custom") {
      fetchData("custom", selectedPipelineId, dateFrom, dateTo);
    }
  };

  const handleSaveWidget = async (input: CreateWidgetInput | UpdateWidgetInput) => {
    if ("id" in input) {
      await updateDashboardWidget(input);
    } else {
      await createDashboardWidget(input);
    }
    await fetchData();
  };

  const handleDeleteWidget = async (widgetId: string) => {
    await deleteDashboardWidget(widgetId);
    await fetchData();
  };

  const handleOpenEdit = (widget: DashboardWidgetData) => {
    setEditingWidget(widget);
    setIsModalOpen(true);
  };

  const handleOpenAdd = () => {
    setEditingWidget(null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header with Filters & Period Switcher */}
      <DashboardHeader
        period={period}
        onPeriodChange={handlePeriodChange}
        dateFrom={dateFrom}
        setDateFrom={(d: string) => {
          setDateFrom(d);
          fetchData("custom", selectedPipelineId, d, dateTo);
        }}
        dateTo={dateTo}
        setDateTo={(d: string) => {
          setDateTo(d);
          fetchData("custom", selectedPipelineId, dateFrom, d);
        }}
        selectedPipelineId={selectedPipelineId}
        onPipelineChange={handlePipelineChange}
        pipelines={pipelines}
        onOpenAddWidget={handleOpenAdd}
        onRefresh={() => fetchData()}
        isRefreshing={isRefreshing}
        baseCurrency={kpis.baseCurrency}
      />

      {/* 2. Mandatory 5 KPI Cards */}
      <section>
        <KpiCards kpis={kpis} />
      </section>

      {/* 3. Dynamic Widgets Grid (Recharts) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">
              Аналитические виджеты ({widgets.length})
            </h2>
            <span className="text-[11px] text-slate-400">
              Графики динамики и распределения продаж
            </span>
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            + Добавить виджет
          </button>
        </div>

        <WidgetGrid
          widgets={widgets}
          onEditWidget={handleOpenEdit}
          onAddWidget={handleOpenAdd}
          baseCurrency={kpis.baseCurrency}
        />
      </section>

      {/* 4. Widget Builder / Editor Modal */}
      <WidgetBuilderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        pipelines={pipelines}
        editingWidget={editingWidget}
        onSaveWidget={handleSaveWidget}
        onDeleteWidget={handleDeleteWidget}
      />
    </div>
  );
}
