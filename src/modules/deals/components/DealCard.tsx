"use client";

import { useState } from "react";
import { DealItem } from "../types";
import { moveDealPipeline } from "../actions";
import { formatCurrency } from "@/lib/utils";
import { getDisplayContactName, resolveDealSource } from "@/lib/dealSource";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  Phone,
  User,
  Tag,
} from "lucide-react";

interface PipelineOption {
  id: string;
  name: string;
}

interface DealCardProps {
  deal: DealItem;
  pipelines?: PipelineOption[];
  onSelect: (deal: DealItem) => void;
  onDragStart?: (e: React.DragEvent, dealId: string) => void;
  onPipelineMoved?: () => void;
}

export function DealCard({
  deal,
  pipelines = [],
  onSelect,
  onDragStart,
  onPipelineMoved,
}: DealCardProps) {
  const [isMovingPipeline, setIsMovingPipeline] = useState(false);

  const handleQuickMovePipeline = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const targetPipelineId = e.target.value;
    if (!targetPipelineId || targetPipelineId === deal.pipelineId) return;

    setIsMovingPipeline(true);
    const res = await moveDealPipeline(deal.id, targetPipelineId);
    setIsMovingPipeline(false);
    if (res.success && onPipelineMoved) {
      onPipelineMoved();
    }
  };
  // Calculate total paid in deal's currency
  const totalPaid = deal.payments.reduce((sum, p) => {
    // If currency matches, add directly; else use amountInBaseCurrency approximation
    return sum + p.amount;
  }, 0);

  const budget = deal.totalBudget;
  const percentPaid = budget > 0 ? Math.min(100, Math.round((totalPaid / budget) * 100)) : 0;

  // Task status check
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const pendingTasks = deal.tasks.filter((t) => !t.isCompleted);
  const overdueTasks = pendingTasks.filter((t) => new Date(t.dueDate) < now);
  const todayTasks = pendingTasks.filter(
    (t) => new Date(t.dueDate).toISOString().slice(0, 10) === todayStr
  );

  let taskBadge = {
    color: "bg-slate-100 text-slate-500 border-slate-200",
    text: "Нет задач",
    icon: Clock,
  };

  if (overdueTasks.length > 0) {
    taskBadge = {
      color: "bg-rose-50 text-rose-700 border-rose-200 font-semibold",
      text: `${overdueTasks.length} проср.`,
      icon: AlertCircle,
    };
  } else if (todayTasks.length > 0) {
    taskBadge = {
      color: "bg-amber-50 text-amber-700 border-amber-200 font-semibold",
      text: `${todayTasks.length} на сегодня`,
      icon: Clock,
    };
  } else if (pendingTasks.length > 0) {
    taskBadge = {
      color: "bg-blue-50 text-blue-700 border-blue-200",
      text: `${pendingTasks.length} в плане`,
      icon: Clock,
    };
  } else if (deal.tasks.length > 0) {
    taskBadge = {
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      text: "Задачи закрыты",
      icon: CheckCircle2,
    };
  }

  const TaskIcon = taskBadge.icon;
  const dealSource = deal.source ?? resolveDealSource(deal);
  const displayName = getDisplayContactName(deal.contact.name, deal.contact.phone);
  const isTargetSource = Boolean(
    dealSource && /таргет|instagram|инст/i.test(dealSource)
  );
  const isAutodialerSource = Boolean(
    dealSource && /автообзвон|callo/i.test(dealSource)
  );

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart && onDragStart(e, deal.id)}
      onClick={() => onSelect(deal)}
      className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-grab active:cursor-grabbing select-none space-y-2.5 group"
    >
      {/* 1) Название сделки & 7) Статус задачи */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition-colors leading-snug line-clamp-2">
          {deal.title}
        </h4>
        <span
          className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${taskBadge.color}`}
        >
          <TaskIcon className="w-2.5 h-2.5" />
          <span>{taskBadge.text}</span>
        </span>
      </div>

      {/* 2) Источник */}
      {dealSource && (
        <div className="flex items-center">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${
              isTargetSource
                ? "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"
                : isAutodialerSource
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            <Tag className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{dealSource}</span>
          </span>
        </div>
      )}

      {/* 3) Имя+фамилия (если есть) & 4) Номер телефона */}
      <div className="space-y-1 text-[11px]">
        {displayName && (
          <div className="flex items-center gap-1.5 font-medium text-slate-800 truncate">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{displayName}</span>
          </div>
        )}
        {deal.contact.phone && (
          <div className="flex items-center gap-1.5 font-medium text-slate-600 tabular-nums truncate">
            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{deal.contact.phone}</span>
          </div>
        )}
      </div>

      {/* Payment progress */}
      {budget > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Оплачено:</span>
            <span className="font-semibold text-emerald-600">
              {formatCurrency(totalPaid, deal.currency)} ({percentPaid}%)
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${percentPaid}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom Bar: 6) Сумма сделки, 5) Ответственный + скрытый перенос без текста воронки */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
        <div className="font-bold text-blue-600">
          {formatCurrency(deal.totalBudget, deal.currency)}
        </div>

        <div className="flex items-center gap-1.5">
          {pipelines.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              title="Перенести в другую воронку"
              className="relative w-6 h-6 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-400 hover:text-blue-600 flex items-center justify-center transition-colors shrink-0"
            >
              <ArrowRightLeft className="w-3 h-3 pointer-events-none" />
              <select
                aria-label="Перенести в другую воронку"
                value={deal.pipelineId}
                disabled={isMovingPipeline}
                onChange={handleQuickMovePipeline}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] border border-slate-200">
              {deal.assignedTo?.name ? deal.assignedTo.name.charAt(0) : "—"}
            </span>
            <span className="truncate max-w-[80px]">
              {deal.assignedTo?.name ? deal.assignedTo.name.split(" ")[0] : "Без отв."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
