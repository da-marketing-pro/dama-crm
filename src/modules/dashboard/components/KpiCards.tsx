"use client";

import { KpiMetrics } from "../types";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  Briefcase,
  CheckCircle2,
  Users,
  Sparkles,
} from "lucide-react";

interface KpiCardsProps {
  kpis: KpiMetrics;
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const cards = [
    {
      id: "revenue",
      title: "Общий доход за период",
      value: formatCurrency(kpis.totalRevenue, kpis.baseCurrency),
      subtitle: `Фактические поступления (${kpis.baseCurrency})`,
      icon: DollarSign,
      gradient: "from-emerald-500/10 to-teal-500/10",
      textColor: "text-emerald-700",
      iconBg: "bg-emerald-600 text-white",
      borderColor: "border-emerald-200/80 hover:border-emerald-300",
    },
    {
      id: "newLeads",
      title: "Новых лидов",
      value: kpis.newLeadsCount.toLocaleString("ru-RU"),
      subtitle: "Создано за выбранный период",
      icon: TrendingUp,
      gradient: "from-blue-500/10 to-indigo-500/10",
      textColor: "text-blue-700",
      iconBg: "bg-blue-600 text-white",
      borderColor: "border-blue-200/80 hover:border-blue-300",
    },
    {
      id: "leadsInWork",
      title: "Лидов в работе",
      value: kpis.leadsInWorkCount.toLocaleString("ru-RU"),
      subtitle: "Открытые сделки на этапах",
      icon: Briefcase,
      gradient: "from-amber-500/10 to-orange-500/10",
      textColor: "text-amber-700",
      iconBg: "bg-amber-600 text-white",
      borderColor: "border-amber-200/80 hover:border-amber-300",
    },
    {
      id: "wonDeals",
      title: "Успешно закрыто (WON)",
      value: kpis.wonDealsCount.toLocaleString("ru-RU"),
      subtitle: "Сделок успешно завершено",
      icon: CheckCircle2,
      gradient: "from-purple-500/10 to-pink-500/10",
      textColor: "text-purple-700",
      iconBg: "bg-purple-600 text-white",
      borderColor: "border-purple-200/80 hover:border-purple-300",
    },
    {
      id: "clientsInProjects",
      title: "Клиентов в проектах",
      value: kpis.clientsInProjectsCount.toLocaleString("ru-RU"),
      subtitle: "Контакты с активными сделками",
      icon: Users,
      gradient: "from-cyan-500/10 to-sky-500/10",
      textColor: "text-cyan-800",
      iconBg: "bg-cyan-600 text-white",
      borderColor: "border-cyan-200/80 hover:border-cyan-300",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.id}
            className={`p-4 rounded-2xl bg-white border ${c.borderColor} shadow-xs hover:shadow-md transition-all duration-200 relative overflow-hidden group flex flex-col justify-between`}
          >
            {/* Ambient background decoration */}
            <div
              className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-gradient-to-br ${c.gradient} opacity-50 blur-xl pointer-events-none group-hover:scale-125 transition-transform`}
            />

            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold text-slate-600 tracking-tight line-clamp-1">
                {c.title}
              </span>
              <div
                className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0 shadow-xs`}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div>
              <div
                className={`text-xl font-black ${c.textColor} tracking-tight font-mono mb-1 truncate`}
              >
                {c.value}
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {c.subtitle}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
