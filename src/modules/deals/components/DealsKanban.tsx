"use client";

import { useState } from "react";
import { DealItem, StageWithDeals } from "../types";
import { DealCard } from "./DealCard";
import { moveDealStage } from "../actions";
import { formatCurrency } from "@/lib/utils";
import { StageType } from "@prisma/client";

interface DealsKanbanProps {
  stages: StageWithDeals[];
  onSelectDeal: (deal: DealItem) => void;
  currencyRateUsd?: number;
  currencyRateRub?: number;
}

export function DealsKanban({
  stages,
  onSelectDeal,
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
    <div className="flex gap-4 overflow-x-auto pb-6 pt-1 select-none min-h-[calc(100vh-230px)] items-start">
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: stage.color }}
                  />
                  <h3 className="font-bold text-xs text-slate-900 truncate">
                    {stage.name}
                  </h3>
                </div>

                <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                  {stage.deals.length}
                </span>
              </div>

              <div className="text-[11px] font-semibold text-slate-500">
                {formatCurrency(stageBudgetKzt, "KZT")}
              </div>
            </div>

            {/* Stage Deals List */}
            <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-300px)] min-h-[140px]">
              {stage.deals.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center text-center p-3 border border-dashed border-slate-300/80 rounded-xl text-slate-400 text-[11px]">
                  <span>Перетащите сделку сюда</span>
                </div>
              ) : (
                stage.deals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onSelect={onSelectDeal}
                    onDragStart={handleDragStart}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
