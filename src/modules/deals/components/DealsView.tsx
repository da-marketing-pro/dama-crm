"use client";

import { useState } from "react";
import { DealItem, PipelineWithStages } from "../types";
import { DealsKanban } from "./DealsKanban";
import { CreateDealModal } from "./CreateDealModal";
import { PipelineSettingsModal } from "./PipelineSettingsModal";
import { DealDrawer } from "./DealDrawer";
import { createPipeline } from "../actions";
import { formatCurrency } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  KanbanSquare,
  Plus,
  Settings,
  ChevronDown,
  Sparkles,
  TrendingUp,
  CreditCard,
  Briefcase,
  GitBranch,
  X,
} from "lucide-react";

interface DealsViewProps {
  pipelines: PipelineWithStages[];
  isAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
  sourceOptions?: string[];
  currencyRateUsd?: number;
  currencyRateRub?: number;
}

export function DealsView({
  pipelines,
  isAdmin,
  currentUserId,
  users,
  sourceOptions,
  currencyRateUsd = 495,
  currencyRateRub = 5.2,
}: DealsViewProps) {
  const router = useRouter();

  // Active pipeline selector
  const [activePipelineId, setActivePipelineId] = useState<string>(
    pipelines[0]?.id || ""
  );

  // Modals state
  const [selectedDeal, setSelectedDeal] = useState<DealItem | null>(null);
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // New pipeline prompt
  const [isAddingPipeline, setIsAddingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [isPipelineCreating, setIsPipelineCreating] = useState(false);

  const activePipeline =
    pipelines.find((p) => p.id === activePipelineId) || pipelines[0];

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName.trim()) return;

    setIsPipelineCreating(true);
    const res = await createPipeline(newPipelineName.trim());
    setIsPipelineCreating(false);

    if (res.success && res.pipelineId) {
      setNewPipelineName("");
      setIsAddingPipeline(false);
      setActivePipelineId(res.pipelineId);
      router.refresh();
    }
  };

  // Pipeline aggregate calculations
  const allDeals = activePipeline?.stages.flatMap((s) => s.deals) || [];

  const totalBudgetKzt = allDeals.reduce((sum, d) => {
    let rate = 1;
    if (d.currency === "USD") rate = currencyRateUsd;
    if (d.currency === "RUB") rate = currencyRateRub;
    return sum + d.totalBudget * rate;
  }, 0);

  const totalPaidKzt = allDeals.reduce((sum, d) => {
    return (
      sum +
      d.payments.reduce((pSum, p) => pSum + p.amountInBaseCurrency, 0)
    );
  }, 0);

  return (
    <div className="space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Pipeline Switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <KanbanSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                Воронка продаж
              </div>
              <div className="relative">
                <select
                  value={activePipelineId}
                  onChange={(e) => setActivePipelineId(e.target.value)}
                  className="appearance-none font-extrabold text-lg text-slate-900 bg-transparent pr-7 focus:outline-none cursor-pointer hover:text-blue-600 transition-colors"
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-0 top-1.5 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Admin Add Pipeline Button */}
          {isAdmin && (
            <button
              onClick={() => setIsAddingPipeline(!isAddingPipeline)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Воронка</span>
            </button>
          )}

          {/* Admin Stage Settings Button */}
          {isAdmin && activePipeline && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Настроить этапы</span>
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateDealOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Новая сделка</span>
          </button>
        </div>
      </div>

      {/* Inline Create Pipeline Form (Admin only) */}
      {isAddingPipeline && isAdmin && (
        <form
          onSubmit={handleCreatePipeline}
          className="p-3.5 rounded-xl bg-white border border-blue-200 shadow-sm flex items-center gap-3 animate-in fade-in"
        >
          <GitBranch className="w-4 h-4 text-blue-600 shrink-0" />
          <input
            type="text"
            required
            value={newPipelineName}
            onChange={(e) => setNewPipelineName(e.target.value)}
            placeholder="Название новой воронки (например: Повторные продажи)"
            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isPipelineCreating || !newPipelineName.trim()}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {isPipelineCreating ? "Создание..." : "Создать"}
          </button>
          <button
            type="button"
            onClick={() => setIsAddingPipeline(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">
              Бюджет в воронке
            </span>
            <div className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
              {formatCurrency(totalBudgetKzt, "KZT")}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">
              Оплачено траншами
            </span>
            <div className="text-sm sm:text-base font-black text-emerald-600 mt-0.5">
              {formatCurrency(totalPaidKzt, "KZT")}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">
              Сделок в пайплайне
            </span>
            <div className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
              {allDeals.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Briefcase className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      {activePipeline && (
        <DealsKanban
          stages={activePipeline.stages}
          pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
          onSelectDeal={(deal) => setSelectedDeal(deal)}
          onPipelineMoved={() => router.refresh()}
          currencyRateUsd={currencyRateUsd}
          currencyRateRub={currencyRateRub}
        />
      )}

      {/* Smart Create Deal Modal */}
      <CreateDealModal
        isOpen={isCreateDealOpen}
        onClose={() => setIsCreateDealOpen(false)}
        pipelines={pipelines}
        defaultPipelineId={activePipelineId}
        users={users}
        currentUserId={currentUserId}
        sourceOptions={sourceOptions}
        onCreated={() => router.refresh()}
      />

      {/* Pipeline Stage Settings Modal (Admin only) */}
      {activePipeline && (
        <PipelineSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          pipelineId={activePipeline.id}
          pipelineName={activePipeline.name}
          stages={activePipeline.stages}
          isAdmin={isAdmin}
          onUpdated={() => router.refresh()}
        />
      )}

      {/* Slide-out Deal Drawer */}
      {(() => {
        const syncedDeal = selectedDeal
          ? pipelines
              .flatMap((p) => p.stages)
              .flatMap((s) => s.deals)
              .find((d) => d.id === selectedDeal.id) || null
          : null;
        return (
          <DealDrawer
            key={syncedDeal?.id || "closed"}
            deal={syncedDeal}
            isOpen={!!syncedDeal}
            onClose={() => setSelectedDeal(null)}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            users={users}
            pipelines={pipelines}
            sourceOptions={sourceOptions}
            onDealDeleted={() => {
              setSelectedDeal(null);
              router.refresh();
            }}
            onDealUpdated={() => router.refresh()}
          />
        );
      })()}
    </div>
  );
}
