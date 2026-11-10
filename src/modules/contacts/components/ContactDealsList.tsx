"use client";

import { useState } from "react";
import { ContactDealItem } from "../types";
import { formatCurrency } from "@/lib/utils";
import { createDealForContact } from "../actions";
import { Currency, StageType } from "@prisma/client";
import {
  CreditCard,
  Briefcase,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

interface PipelineInfo {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    color: string;
    type: StageType;
  }[];
}

interface ContactDealsListProps {
  contactId: string;
  deals: ContactDealItem[];
  totalPaidBaseCurrency: number;
  pipelines: PipelineInfo[];
  users: { id: string; name: string }[];
  currentUserId: string;
  onDealCreated?: () => void;
}

export function ContactDealsList({
  contactId,
  deals,
  totalPaidBaseCurrency,
  pipelines,
  users,
  currentUserId,
  onDealCreated,
}: ContactDealsListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [dealTitle, setDealTitle] = useState("");
  const [selectedPipelineId, setSelectedPipelineId] = useState(pipelines[0]?.id || "");
  const [selectedStageId, setSelectedStageId] = useState(
    pipelines[0]?.stages[0]?.id || ""
  );
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState<Currency>(Currency.KZT);
  const [assignedToId, setAssignedToId] = useState(currentUserId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update stage when pipeline changes
  const handlePipelineChange = (pId: string) => {
    setSelectedPipelineId(pId);
    const p = pipelines.find((pipe) => pipe.id === pId);
    if (p && p.stages.length > 0) {
      setSelectedStageId(p.stages[0].id);
    }
  };

  const currentPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealTitle.trim()) return;

    setError(null);
    setLoading(true);

    const res = await createDealForContact({
      contactId,
      title: dealTitle.trim(),
      pipelineId: selectedPipelineId,
      stageId: selectedStageId,
      totalBudget: parseFloat(budget) || 0,
      currency,
      assignedToId,
    });

    setLoading(false);
    if (!res.success) {
      setError(res.error || "Не удалось создать сделку");
    } else {
      setDealTitle("");
      setBudget("");
      setIsCreating(false);
      if (onDealCreated) onDealCreated();
    }
  };

  // Calculations
  const totalPipelineBudget = deals.reduce((sum, d) => sum + d.totalBudget, 0);

  return (
    <div className="space-y-4">
      {/* 1. Prominent Financial Widget */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-700/15 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-200" />
              Финансовый виджет клиента
            </span>
            <div className="text-2xl sm:text-3xl font-black mt-2 tracking-tight">
              {formatCurrency(totalPaidBaseCurrency, "KZT")}
            </div>
            <p className="text-xs text-emerald-100/90 mt-1">
              Всего фактически оплачено траншами по всем сделкам
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-full font-semibold">
              {deals.length} сделок
            </span>
          </div>
        </div>
      </div>

      {/* 2. Deals Header & Create Button */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Сделки контакта ({deals.length})
          </h4>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isCreating ? "Отмена" : "Создать сделку"}</span>
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Create Deal Inline Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateDeal}
          className="p-4 rounded-xl bg-slate-50 border border-blue-200 space-y-3 animate-in fade-in duration-150"
        >
          <div className="text-xs font-bold text-slate-800">
            Новая сделка для текущего контакта
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">
              Название сделки *
            </label>
            <input
              type="text"
              required
              value={dealTitle}
              onChange={(e) => setDealTitle(e.target.value)}
              placeholder="Например: Поставка оборудования"
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">Воронка</label>
              <select
                value={selectedPipelineId}
                onChange={(e) => handlePipelineChange(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">Этап</label>
              <select
                value={selectedStageId}
                onChange={(e) => setSelectedStageId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium"
              >
                {currentPipeline?.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">Бюджет</label>
              <input
                type="number"
                min="0"
                step="any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="500000"
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">Валюта</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium"
              >
                <option value="KZT">KZT (₸)</option>
                <option value="USD">USD ($)</option>
                <option value="RUB">RUB (₽)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Создание..." : "Создать"}
            </button>
          </div>
        </form>
      )}

      {/* 4. Deals List */}
      {deals.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
          У этого контакта пока нет открытых или завершенных сделок.
        </div>
      ) : (
        <div className="space-y-2.5">
          {deals.map((deal) => {
            const isWon = deal.stage.type === "WON";
            const isLost = deal.stage.type === "LOST";

            // Total paid for this specific deal
            const dealPaid = deal.payments?.reduce((acc, p) => acc + p.amount, 0) || 0;

            return (
              <div
                key={deal.id}
                className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h5 className="font-bold text-xs text-slate-900">{deal.title}</h5>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Воронка: <strong>{deal.pipeline.name}</strong>
                    </div>
                  </div>

                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 flex items-center gap-1"
                    style={{
                      backgroundColor: `${deal.stage.color}15`,
                      color: deal.stage.color,
                      border: `1px solid ${deal.stage.color}40`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: deal.stage.color }}
                    />
                    <span>{deal.stage.name}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500">Бюджет: </span>
                    <strong className="text-slate-900">
                      {formatCurrency(deal.totalBudget, deal.currency)}
                    </strong>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500">Оплачено: </span>
                    <strong className="text-emerald-600">
                      {formatCurrency(dealPaid, deal.currency)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
