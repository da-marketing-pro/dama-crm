"use client";

import { useState } from "react";
import { Currency } from "@prisma/client";
import {
  DollarSign,
  Save,
  AlertCircle,
  CheckCircle,
  Calculator,
  ShieldAlert,
  RefreshCw,
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";
import { updateCurrencySettings } from "../actions";
import { formatDate } from "@/lib/utils";

interface CurrencySettingData {
  id: string;
  baseCurrency: Currency;
  rateKzt: number;
  rateUsd: number;
  rateRub: number;
  updatedAt?: Date | string;
}

interface CurrencyManagerProps {
  settings: CurrencySettingData | null;
  isAdmin: boolean;
}

export function CurrencyManager({ settings, isAdmin }: CurrencyManagerProps) {
  const [baseCurrency, setBaseCurrency] = useState<Currency>(settings?.baseCurrency || "KZT");
  const [rateUsd, setRateUsd] = useState<number>(settings?.rateUsd || 495.0);
  const [rateRub, setRateRub] = useState<number>(settings?.rateRub || 5.2);
  const [lastUpdated, setLastUpdated] = useState<Date | string | undefined>(settings?.updatedAt);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncDetails, setSyncDetails] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) return;

    setError(null);
    setSuccess(null);
    setSyncDetails(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("baseCurrency", baseCurrency);
    formData.append("rateUsd", rateUsd.toString());
    formData.append("rateRub", rateRub.toString());

    const res = await updateCurrencySettings(formData);
    setLoading(false);

    if (!res.success) {
      setError(res.error || "Ошибка сохранения курсов");
    } else {
      setLastUpdated(new Date());
      setSuccess("Курсы валют и базовая валюта успешно сохранены!");
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  // Ручной вызов защищенного API-маршрута обновления курсов (Cron Endpoint)
  const handleSyncRates = async () => {
    if (!isAdmin || syncing) return;

    setSyncing(true);
    setError(null);
    setSuccess(null);
    setSyncDetails(null);

    try {
      const res = await fetch("/api/cron/update-rates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Не удалось синхронизировать курсы");
      }

      setRateUsd(data.newRates.rateUsd);
      setRateRub(data.newRates.rateRub);
      setLastUpdated(data.updatedAt);
      setSuccess(
        `Курсы успешно синхронизированы: 1 $ = ${data.newRates.rateUsd} ₸, 1 ₽ = ${data.newRates.rateRub} ₸`
      );
      setSyncDetails(
        `Среднеарифметическое за 60 дней (${data.period.start} — ${data.period.end}, выборка: ${data.period.daysSampled} точек). Исторические сделки и транши сохранены без изменений.`
      );
      setTimeout(() => setSuccess(null), 7000);
    } catch (err: any) {
      setError(err?.message || "Ошибка соединения с эндпоинтом обновления курсов");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">
              Мультивалютный учет и курсы конвертации
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              KZT / USD / RUB
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Все транши и бюджеты автоматически приводятся к базовой валюте в аналитике и отчетах.
          </p>
        </div>

        {/* Sync Button */}
        {isAdmin && (
          <button
            type="button"
            onClick={handleSyncRates}
            disabled={syncing}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-60 active:scale-98 shrink-0"
            title="Рассчитать средний курс USD и RUB за последние 60 дней и обновить текущие курсы"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Синхронизация за 60 дней..." : "Синхронизировать курсы за 2 месяца"}</span>
          </button>
        )}
      </div>

      {/* Cron & Auto-update Status Info Strip */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <Clock className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Дата последнего обновления курсов:{" "}
            <strong className="text-slate-900 font-bold">
              {lastUpdated ? formatDate(lastUpdated) : "Еще не обновлялись"}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-200">
            <Calendar className="w-3 h-3" />
            Автообновление: 1-е число каждого месяца (среднее за 60 дней)
          </span>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Изменение курсов валют доступно только Администратору. Менеджеры могут просматривать действующие курсы.
          </span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{success}</span>
          </div>
          {syncDetails && (
            <p className="text-[11px] text-emerald-800/90 pl-6">
              {syncDetails}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Base Currency */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Базовая валюта системы
            </label>
            <select
              disabled={!isAdmin}
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value as Currency)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              <option value="KZT">KZT — Казахстанский тенге (₸)</option>
              <option value="USD">USD — Доллар США ($)</option>
              <option value="RUB">RUB — Российский рубль (₽)</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-2">
              В этой валюте агрегируются дашборды, отчеты по выручке и общий бюджет воронок.
            </p>
          </div>

          {/* USD Rate */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Курс USD к базовой (KZT)
              </label>
              <span className="text-xs font-bold text-blue-600">$ 1.00</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                disabled={!isAdmin}
                value={rateUsd}
                onChange={(e) => setRateUsd(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">₸</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Текущий расчет: $100 = {(100 * rateUsd).toLocaleString("ru-RU")} ₸
            </p>
          </div>

          {/* RUB Rate */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Курс RUB к базовой (KZT)
              </label>
              <span className="text-xs font-bold text-emerald-600">₽ 1.00</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                disabled={!isAdmin}
                value={rateRub}
                onChange={(e) => setRateRub(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">₸</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Текущий расчет: 1 000 ₽ = {(1000 * rateRub).toLocaleString("ru-RU")} ₸
            </p>
          </div>
        </div>

        {/* Live Tranche Converter Preview */}
        <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Пример мультивалютного транша в сделке:
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Если клиент вносит предоплату <strong>$500</strong>, в сделке запишется: <strong>$500</strong> и эквивалент{" "}
                <strong className="text-blue-700">
                  {(500 * rateUsd).toLocaleString("ru-RU")} ₸
                </strong>{" "}
                в базовую аналитику.
              </div>
            </div>
          </div>

          {isAdmin && (
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? "Сохранение..." : "Сохранить курсы"}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
