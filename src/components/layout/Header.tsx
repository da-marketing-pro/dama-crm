"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { DollarSign, Shield, UserCheck, Clock, Bell } from "lucide-react";
import { useTaskAlerts } from "@/contexts/TaskAlertsContext";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  currencyRates?: {
    baseCurrency: string;
    rateUsd: number;
    rateRub: number;
  } | null;
}

export function Header({ title = "DAMA CRM", subtitle, currencyRates }: HeaderProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const {
    upcoming30MinTask,
    upcoming30MinLabel,
    pushPermission,
    requestPushPermission,
  } = useTaskAlerts();

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-4 min-w-0">
        <div className="shrink-0">
          <h1 className="text-lg font-bold text-slate-800 leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>

        {/* 2a: Small Banner for tasks within 30 minutes */}
        {upcoming30MinTask && upcoming30MinLabel && (
          <Link
            href="/tasks"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 hover:bg-amber-100/90 border border-amber-300 text-amber-900 shadow-xs transition-all cursor-pointer animate-in fade-in group shrink-0"
            title="Нажмите, чтобы открыть запланированную задачу"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-bold truncate max-w-[200px] sm:max-w-xs md:max-w-md">
              {upcoming30MinLabel}
            </span>
            <span className="text-[10px] text-amber-600 font-bold group-hover:translate-x-0.5 transition-transform">
              →
            </span>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Enable Browser Push prompt if not yet granted */}
        {pushPermission === "default" && (
          <button
            type="button"
            onClick={requestPushPermission}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
            title="Включить пуш-уведомления за 10 мин до задачи"
          >
            <Bell className="w-3 h-3 text-blue-600" />
            <span>Включить пуши</span>
          </button>
        )}
        {/* Currencies Pill */}
        {currencyRates && (
          <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <span className="flex items-center gap-1 font-semibold text-slate-600">
              <DollarSign className="w-3.5 h-3.5 text-blue-600" />
              Базовая:{" "}
              <strong className="text-blue-700 font-bold">
                {currencyRates.baseCurrency === "USD"
                  ? "$ USD"
                  : currencyRates.baseCurrency === "RUB"
                  ? "₽ RUB"
                  : "₸ KZT"}
              </strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-700 font-medium">
              1 $ = <strong className="text-slate-900">{currencyRates.rateUsd} ₸</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-700 font-medium">
              1 ₽ = <strong className="text-slate-900">{currencyRates.rateRub} ₸</strong>
            </span>
          </div>
        )}

        {/* User Role Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50">
          {isAdmin ? (
            <Shield className="w-4 h-4 text-amber-500" />
          ) : (
            <UserCheck className="w-4 h-4 text-emerald-600" />
          )}
          <div className="text-xs">
            <span className="font-semibold text-slate-800">{session?.user?.name || "Пользователь"}</span>
            <span className="text-slate-400 mx-1">•</span>
            <span className="text-slate-500 font-medium">
              {isAdmin ? "Администратор" : "Менеджер"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
