"use client";

import { useState, useEffect } from "react";
import { DashboardWidgetData } from "../types";
import { formatCurrency } from "@/lib/utils";
import { Currency } from "@prisma/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Settings2,
  TrendingUp,
  BarChart2,
  PieChart as PieIcon,
  Hash,
  AlertCircle,
  Plus,
} from "lucide-react";

const PALETTE = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#8B5CF6", // purple
  "#F59E0B", // amber
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
  "#6366F1", // indigo
];

interface WidgetGridProps {
  widgets: DashboardWidgetData[];
  onEditWidget: (widget: DashboardWidgetData) => void;
  onAddWidget: () => void;
  baseCurrency?: Currency;
}

export function WidgetGrid({
  widgets,
  onEditWidget,
  onAddWidget,
  baseCurrency = Currency.USD,
}: WidgetGridProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (widgets.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <BarChart2 className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-800">
            На дашборде пока нет виджетов
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Создайте первый аналитический виджет для отслеживания выручки, лидов или этапов сделок
          </p>
        </div>
        <button
          type="button"
          onClick={onAddWidget}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Создать виджет</span>
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {widgets.map((w) => {
        const isWide = w.chartType === "LINE" || w.chartType === "BAR";

        return (
          <div
            key={w.id}
            className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between group ${
              w.chartType === "NUMBER" ? "lg:col-span-1" : "lg:col-span-1"
            }`}
          >
            {/* Widget Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  {w.title}
                </h3>
                {w.secondaryValue && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {w.secondaryValue}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                  {w.chartType}
                </span>

                <button
                  type="button"
                  onClick={() => onEditWidget(w)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Настроить виджет"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Widget Chart / Content */}
            <div className="flex-1 min-h-[220px] flex flex-col justify-center">
              {(() => {
                const widgetCurrency = (w.baseCurrency || baseCurrency) as "USD" | "KZT" | "RUB";
                const currencySymbol =
                  widgetCurrency === "USD" ? "$" : widgetCurrency === "RUB" ? "₽" : "₸";

                if (!isMounted) {
                  return (
                    <div className="h-56 flex items-center justify-center text-xs text-slate-400 animate-pulse">
                      Загрузка диаграммы...
                    </div>
                  );
                }

                if (w.chartType === "NUMBER") {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                      <div className="text-3xl font-black text-slate-900 font-mono tracking-tight">
                        {w.metricType === "REVENUE"
                          ? formatCurrency(w.totalValue || 0, widgetCurrency)
                          : (w.totalValue || 0).toLocaleString("ru-RU")}
                      </div>
                      <div className="text-xs font-medium text-slate-500">
                        {w.metricType === "REVENUE"
                          ? `Общий объем поступлений (${widgetCurrency})`
                          : w.metricType === "LEADS"
                          ? "Всего обращений за период"
                          : "Общее количество сделок"}
                      </div>
                    </div>
                  );
                }

                if (w.data.length === 0) {
                  return (
                    <div className="h-56 flex flex-col items-center justify-center text-xs text-slate-400 space-y-1">
                      <AlertCircle className="w-5 h-5 text-slate-300" />
                      <span>Нет данных за выбранный период</span>
                    </div>
                  );
                }

                if (w.chartType === "LINE") {
                  return (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={w.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis
                            dataKey="date"
                            stroke="#94A3B8"
                            fontSize={11}
                            tickLine={false}
                            axisLine={{ stroke: "#E2E8F0" }}
                          />
                          <YAxis
                            stroke="#94A3B8"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => {
                              if (w.metricType !== "REVENUE") {
                                return val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val;
                              }
                              if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M ${currencySymbol}`;
                              if (val >= 1000) return `${(val / 1000).toFixed(0)}k ${currencySymbol}`;
                              return `${val} ${currencySymbol}`;
                            }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1E293B",
                              borderRadius: "12px",
                              border: "none",
                              color: "#fff",
                              fontSize: "12px",
                              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                            }}
                            formatter={(value: any) => [
                              w.metricType === "REVENUE"
                                ? formatCurrency(Number(value), widgetCurrency)
                                : value,
                              w.metricType === "REVENUE" ? `Выручка (${widgetCurrency})` : "Количество",
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey={w.metricType === "REVENUE" ? "Выручка" : "Лиды"}
                            stroke="#10B981"
                            strokeWidth={2.5}
                            dot={{ r: 2.5, fill: "#10B981" }}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                }

                if (w.chartType === "BAR") {
                  return (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={w.data}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis
                            dataKey={
                              w.metricType === "DEALS_BY_STAGE" || w.metricType === "DEALS_BY_MANAGER"
                                ? "name"
                                : "date"
                            }
                            stroke="#94A3B8"
                            fontSize={11}
                            tickLine={false}
                            axisLine={{ stroke: "#E2E8F0" }}
                          />
                          <YAxis
                            stroke="#94A3B8"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => {
                              if (w.metricType !== "REVENUE") {
                                return val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val;
                              }
                              if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M ${currencySymbol}`;
                              if (val >= 1000) return `${(val / 1000).toFixed(0)}k ${currencySymbol}`;
                              return `${val} ${currencySymbol}`;
                            }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1E293B",
                              borderRadius: "12px",
                              border: "none",
                              color: "#fff",
                              fontSize: "12px",
                            }}
                            formatter={(value: any, name: any) => [
                              name === "Выручка" || w.metricType === "REVENUE"
                                ? formatCurrency(Number(value), widgetCurrency)
                                : value,
                              name === "Выручка"
                                ? `Выручка (${widgetCurrency})`
                                : name || (w.metricType === "REVENUE" ? `Выручка (${widgetCurrency})` : "Количество"),
                            ]}
                          />
                          <Bar
                            dataKey={
                              w.metricType === "REVENUE"
                                ? "Выручка"
                                : w.metricType === "DEALS_BY_STAGE" || w.metricType === "DEALS_BY_MANAGER"
                                ? "Сделок"
                                : "Лиды"
                            }
                            radius={[6, 6, 0, 0]}
                            fill="#3B82F6"
                          >
                            {w.metricType === "DEALS_BY_STAGE" &&
                              w.data.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.color || PALETTE[index % PALETTE.length]}
                                />
                              ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                }

                return (
                  /* PIE CHART */
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={w.data}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={3}
                        >
                          {w.data.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color || PALETTE[index % PALETTE.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1E293B",
                            borderRadius: "12px",
                            border: "none",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                          formatter={(value: any) => [
                            w.metricType === "REVENUE"
                              ? formatCurrency(Number(value), widgetCurrency)
                              : value,
                            w.metricType === "REVENUE" ? `Выручка (${widgetCurrency})` : "Количество",
                          ]}
                        />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
