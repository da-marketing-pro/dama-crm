"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { DealItem, PipelineWithStages, DealCustomFieldDef } from "../types";
import { DealsKanban } from "./DealsKanban";
import { CreateDealModal } from "./CreateDealModal";
import { PipelineSettingsModal } from "./PipelineSettingsModal";
import { DealDrawer } from "./DealDrawer";
import { createPipeline } from "../actions";
import { formatCurrency } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
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
  Search,
  User,
  Building2,
  Phone,
} from "lucide-react";

export function matchDeal(deal: DealItem, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  // 1. Поиск по ФИО / имени контакта
  if (deal.contact?.name && deal.contact.name.toLowerCase().includes(q)) {
    return true;
  }

  // 2. Поиск по названию компании
  if (deal.contact?.company && deal.contact.company.toLowerCase().includes(q)) {
    return true;
  }

  // 3. Поиск по названию сделки
  if (deal.title && deal.title.toLowerCase().includes(q)) {
    return true;
  }

  // 4. Поиск по email
  if (deal.contact?.email && deal.contact.email.toLowerCase().includes(q)) {
    return true;
  }

  // 5. Поиск по номеру телефона
  const rawPhone = deal.contact?.phone || "";
  if (rawPhone.toLowerCase().includes(q)) {
    return true;
  }

  // Сравнение по очищенным цифрам номера (например пользователь ввёл 7701, +7(701)... или 8701)
  const qDigits = rawQuery.replace(/\D/g, "");
  if (qDigits.length >= 2) {
    const phoneDigits = rawPhone.replace(/\D/g, "");
    if (phoneDigits.includes(qDigits)) {
      return true;
    }
    // Нормализация первой цифры для номеров Казахстана и СНГ (8 -> 7)
    const qNorm = qDigits.startsWith("8") && qDigits.length >= 10 ? "7" + qDigits.slice(1) : qDigits;
    const phoneNorm = phoneDigits.startsWith("8") && phoneDigits.length >= 10 ? "7" + phoneDigits.slice(1) : phoneDigits;
    if (phoneNorm.includes(qNorm) || phoneNorm.includes(qDigits)) {
      return true;
    }
  }

  return false;
}

interface DealsViewProps {
  pipelines: PipelineWithStages[];
  isAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
  sourceOptions?: string[];
  initialFieldDefinitions?: DealCustomFieldDef[];
  currencyRateUsd?: number;
  currencyRateRub?: number;
  initialDealId?: string;
}

export function DealsView({
  pipelines,
  isAdmin,
  currentUserId,
  users,
  sourceOptions,
  initialFieldDefinitions,
  currencyRateUsd = 495,
  currencyRateRub = 5.2,
  initialDealId,
}: DealsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Find initial deal if initialDealId or URL searchParams is provided
  const targetDealIdFromUrl = searchParams?.get("dealId") || initialDealId;
  const initialTargetDeal = targetDealIdFromUrl
    ? pipelines
        .flatMap((p) => p.stages)
        .flatMap((s) => s.deals)
        .find((d) => d.id === targetDealIdFromUrl) || null
    : null;

  // Active pipeline selector
  const [activePipelineId, setActivePipelineId] = useState<string>(
    initialTargetDeal?.pipelineId || pipelines[0]?.id || ""
  );

  // Modals state
  const [selectedDeal, setSelectedDeal] = useState<DealItem | null>(
    initialTargetDeal
  );
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [createDealDefaultStageId, setCreateDealDefaultStageId] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // All deals across all pipelines for global quick search popup
  const allPipelinesDeals = useMemo(() => {
    return pipelines.flatMap((p) =>
      p.stages.flatMap((s) =>
        s.deals.map((d) => ({
          ...d,
          pipelineName: p.name,
          stageName: s.name,
          stageColor: s.color,
        }))
      )
    );
  }, [pipelines]);

  const globalSearchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return allPipelinesDeals.filter((d) => matchDeal(d, q)).slice(0, 15);
  }, [allPipelinesDeals, searchQuery]);

  const activePipeline =
    pipelines.find((p) => p.id === activePipelineId) || pipelines[0];

  // Filtered stages for current pipeline kanban
  const displayedStages = useMemo(() => {
    if (!activePipeline) return [];
    if (!searchQuery.trim()) return activePipeline.stages;
    return activePipeline.stages.map((stage) => ({
      ...stage,
      deals: stage.deals.filter((deal) => matchDeal(deal, searchQuery)),
    }));
  }, [activePipeline, searchQuery]);

  const totalMatchingInCurrentPipeline = useMemo(() => {
    return displayedStages.reduce((sum, s) => sum + s.deals.length, 0);
  }, [displayedStages]);

  // Auto-open deal if URL searchParams change
  useEffect(() => {
    const dealId = searchParams?.get("dealId") || initialDealId;
    if (dealId) {
      for (const p of pipelines) {
        for (const s of p.stages) {
          const found = s.deals.find((d) => d.id === dealId);
          if (found) {
            setActivePipelineId(p.id);
            setSelectedDeal(found);
            return;
          }
        }
      }
    }
  }, [searchParams, initialDealId, pipelines]);

  // New pipeline prompt
  const [isAddingPipeline, setIsAddingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [isPipelineCreating, setIsPipelineCreating] = useState(false);

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
    <div className="space-y-4 w-full min-w-0 max-w-full">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
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

        {/* Right: Search Bar */}
        <div className="relative w-full md:w-80 lg:w-96 shrink-0" ref={searchContainerRef}>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => {
                if (searchQuery.trim()) {
                  setIsSearchOpen(true);
                }
              }}
              placeholder="Поиск по телефону, компании, имени..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white border border-slate-200 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                title="Очистить поиск"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Dropdown Popup */}
          {isSearchOpen && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-96 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
              <div className="p-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>Найдено сделок и лидов: {globalSearchResults.length}</span>
                {globalSearchResults.length > 0 && (
                  <span className="text-[10px] text-slate-400">Нажмите, чтобы открыть сделку</span>
                )}
              </div>

              {globalSearchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Ничего не найдено</div>
                  <div className="text-[11px] text-slate-400">
                    По запросу «{searchQuery.trim()}» нет совпадений по номеру, имени или компании
                  </div>
                </div>
              ) : (
                <div className="p-1 space-y-1">
                  {globalSearchResults.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => {
                        setActivePipelineId(deal.pipelineId);
                        setSelectedDeal(deal);
                        setIsSearchOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-blue-50/50 transition-colors flex flex-col gap-1.5 group cursor-pointer border border-transparent hover:border-blue-200"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-blue-600 truncate transition-colors">
                          {deal.title}
                        </span>
                        <span className="text-xs font-black text-slate-800 shrink-0">
                          {formatCurrency(deal.totalBudget, deal.currency)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 text-xs text-slate-600 flex-wrap">
                        {deal.contact?.name && (
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{deal.contact.name}</span>
                          </span>
                        )}
                        {deal.contact?.company && (
                          <span className="flex items-center gap-1 text-slate-600">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{deal.contact.company}</span>
                          </span>
                        )}
                        {deal.contact?.phone && (
                          <span className="flex items-center gap-1 font-mono text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200/60">
                            <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{deal.contact.phone}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100/80">
                        <span className="truncate">
                          Воронка: <strong className="font-semibold text-slate-700">{deal.pipelineName}</strong>
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0 text-white"
                          style={{ backgroundColor: deal.stageColor }}
                        >
                          {deal.stageName}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
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

        <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
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

      {/* Action Strip: "Новая сделка" placed on the left between the Budget widget and the First Stage */}
      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setCreateDealDefaultStageId(undefined);
            setIsCreateDealOpen(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Новая сделка</span>
        </button>

        {/* Search Results Summary Tag */}
        {searchQuery.trim() && (
          <div className="flex items-center gap-2 text-xs bg-blue-50 text-blue-900 px-3 py-1.5 rounded-xl border border-blue-200">
            <span>
              Поиск: <strong>«{searchQuery.trim()}»</strong> — найдено в «{activePipeline?.name}»:{" "}
              <strong>{totalMatchingInCurrentPipeline}</strong>
              {globalSearchResults.length > totalMatchingInCurrentPipeline && (
                <span className="text-slate-500 ml-1">
                  (и ещё {globalSearchResults.length - totalMatchingInCurrentPipeline} в других воронках)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5 ml-1 cursor-pointer hover:underline"
            >
              <X className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      {activePipeline && (
        <DealsKanban
          stages={displayedStages}
          pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
          onSelectDeal={(deal) => setSelectedDeal(deal)}
          onCreateDealAtStage={(stageId) => {
            setCreateDealDefaultStageId(stageId);
            setIsCreateDealOpen(true);
          }}
          onPipelineMoved={() => router.refresh()}
          currencyRateUsd={currencyRateUsd}
          currencyRateRub={currencyRateRub}
          isSearchActive={Boolean(searchQuery.trim())}
        />
      )}

      {/* Smart Create Deal Modal */}
      <CreateDealModal
        isOpen={isCreateDealOpen}
        onClose={() => {
          setIsCreateDealOpen(false);
          setCreateDealDefaultStageId(undefined);
        }}
        pipelines={pipelines}
        defaultPipelineId={activePipelineId}
        defaultStageId={createDealDefaultStageId}
        users={users}
        currentUserId={currentUserId}
        sourceOptions={sourceOptions}
        onCreated={() => {
          setIsCreateDealOpen(false);
          setCreateDealDefaultStageId(undefined);
          router.refresh();
        }}
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
            onClose={() => {
              setSelectedDeal(null);
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                if (url.searchParams.has("dealId")) {
                  url.searchParams.delete("dealId");
                  window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
                }
              }
            }}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            users={users}
            pipelines={pipelines}
            sourceOptions={sourceOptions}
            initialFieldDefinitions={initialFieldDefinitions}
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
