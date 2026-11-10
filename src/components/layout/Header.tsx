"use client";

import { useSession } from "next-auth/react";
import { DollarSign, Shield, UserCheck } from "lucide-react";

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

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
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
