"use client";

import { useState } from "react";
import { DealItem, StageWithDeals } from "../types";
import { DealCard } from "./DealCard";
import { moveDealStage } from "../actions";
import { formatCurrency } from "@/lib/utils";
import { StageType } from "@prisma/client";
import { Plus } from "lucide-react";

interface PipelineOption {
  id: string;
  name: string;
}

interface DealsKanbanProps {
  stages: StageWithDeals[];
  pipelines?: PipelineOption[];
  onSelectDeal: (deal: DealItem) => void;
  onCreateDealAtStage?: (stageId: string) => void;
  onPipelineMoved?: () => void;
  currencyRateUsd?: number;
  currencyRateRub?: number;
}

export function DealsKanban({
  stages,
  pipelines = [],
  onSelectDeal,
  onCreateDealAtStage,
  onPipelineMoved,
  currencyRateUsd = 495,
  currencyRateRub = 5.2,
}: DealsKanbanProps) {
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    setDraggedDealId(dealId);
    e.dataTransfer.setData("text/plain", dealId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (activeStageId !== stageId) {
      setActiveStageId(stageId);
    }
  };

  const handleDragLeave = () => {
    setActiveStageId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    setActiveStageId(null);
    const dealId = e.dataTransfer.getData("text/plain") || draggedDealId;
    if (!dealId) return;

    // Call server action to update stage
    await moveDealStage(dealId, targetStageId);
    setDraggedDealId(null);
  };

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto pb-4 pt-1 select-none kanban-scroll-area">
      <div className="flex gap-4 items-start w-max min-w-full pb-2">
        {stages.map((stage) => {
          const isHovered = activeStageId === stage.id;
          const isWon = stage.type === StageType.WON;
          const isLost = stage.type === StageType.LOST;

          // Stage budget calculated in base currency (₸)
          const stageBudgetKzt = stage.deals.reduce((sum, d) => {
            let rate = 1;
            if (d.currency === "USD") rate = currencyRateUsd;
            if (d.currency === "RUB") rate = currencyRateRub;
            return sum + d.totalBudget * rate;
          }, 0);

          return (
            <div
              key={stage.id}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
              className={`w-72 shrink-0 rounded-2xl flex flex-col transition-all duration-200 border ${
                isHovered
                  ? "bg-blue-50/80 border-blue-400 ring-2 ring-blue-400/20 shadow-md"
                  : isWon
                  ? "bg-emerald-50/40 border-emerald-200"
                  : isLost
                  ? "bg-rose-50/40 border-rose-200"
                  : "bg-slate-200/50 border-slate-300/60"
              }`}
            >
              {/* Stage Column Header */}
              <div className="p-3.5 border-b border-slate-300/60 space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="font-bold text-xs text-slate-900 truncate" title={stage.name}>
                      {stage.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateDealAtStage?.(stage.id);
                      }}
                      title={`Создать сделку на этапе «${stage.name}»`}
                      aria-label={`Создать сделку на этапе «${stage.name}»`}
                      className="w-6 h-6 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs hover:shadow-xs group/add"
                    >
                      <Plus className="w-3.5 h-3.5 group-hover/add:scale-110 transition-transform" />
                    </button>

                    <span className="min-w-6 h-6 px-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shadow-2xs">
                      {stage.deals.length}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] font-semibold text-slate-500">
                  {formatCurrency(stageBudgetKzt, "KZT")}
                </div>
              </div>

              {/* Stage Deals List */}
              <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[140px]">
                {stage.deals.length === 0 ? (
                  <div className="h-28 flex flex-col items-center justify-center text-center p-3 border border-dashed border-slate-300/80 rounded-xl text-slate-400 text-[11px] gap-1.5">
                    <span>Перетащите сделку сюда</span>
                    <button
                      type="button"
                      onClick={() => onCreateDealAtStage?.(stage.id)}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Создать сделку</span>
                    </button>
                  </div>
                ) : (
                  stage.deals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      pipelines={pipelines}
                      onSelect={onSelectDeal}
                      onDragStart={handleDragStart}
                      onPipelineMoved={onPipelineMoved}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
