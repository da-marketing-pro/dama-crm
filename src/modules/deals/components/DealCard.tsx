"use client";

import { DealItem } from "../types";
import { formatCurrency } from "@/lib/utils";
import {
  Phone,
  Building,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
} from "lucide-react";

interface DealCardProps {
  deal: DealItem;
  onSelect: (deal: DealItem) => void;
  onDragStart?: (e: React.DragEvent, dealId: string) => void;
}

export function DealCard({ deal, onSelect, onDragStart }: DealCardProps) {
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

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart && onDragStart(e, deal.id)}
      onClick={() => onSelect(deal)}
      className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition-all cursor-grab active:cursor-grabbing select-none space-y-2.5 group"
    >
      {/* Title & Task Badge */}
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

      {/* Contact info */}
      <div className="text-[11px] text-slate-500 space-y-0.5">
        <div className="font-medium text-slate-800 truncate">
          {deal.contact.name}
        </div>
        {deal.contact.company && (
          <div className="flex items-center gap-1 text-slate-400 text-[10px] truncate">
            <Building className="w-3 h-3 shrink-0" />
            <span>{deal.contact.company}</span>
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

      {/* Bottom Bar: Budget & Responsible */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
        <div className="font-bold text-blue-600">
          {formatCurrency(deal.totalBudget, deal.currency)}
        </div>

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
  );
}
