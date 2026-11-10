"use client";

import { useState } from "react";
import { ContactDealItem, ContactNoteItem, ContactPaymentItem, ContactTaskItem } from "../types";
import { addContactNote } from "../actions";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  CreditCard,
  Briefcase,
  CheckSquare,
  Clock,
  User,
  Shield,
  FileText,
} from "lucide-react";

interface ContactTimelineProps {
  contactId: string;
  notes: ContactNoteItem[];
  deals: ContactDealItem[];
  payments: ContactPaymentItem[];
  tasks: ContactTaskItem[];
  canAddNote: boolean;
  onNoteAdded?: () => void;
}

type TimelineEvent =
  | { type: "NOTE"; date: Date; data: ContactNoteItem }
  | { type: "DEAL"; date: Date; data: ContactDealItem }
  | { type: "PAYMENT"; date: Date; data: ContactPaymentItem }
  | { type: "TASK"; date: Date; data: ContactTaskItem };

export function ContactTimeline({
  contactId,
  notes,
  deals,
  payments,
  tasks,
  canAddNote,
  onNoteAdded,
}: ContactTimelineProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setError(null);

    const res = await addContactNote(contactId, content.trim());
    setLoading(false);

    if (!res.success) {
      setError(res.error || "Ошибка сохранения");
    } else {
      setContent("");
      if (onNoteAdded) onNoteAdded();
    }
  };

  // Build unified timeline
  const events: TimelineEvent[] = [
    ...notes.map((n) => ({ type: "NOTE" as const, date: new Date(n.createdAt), data: n })),
    ...deals.map((d) => ({ type: "DEAL" as const, date: new Date(d.createdAt), data: d })),
    ...payments.map((p) => ({ type: "PAYMENT" as const, date: new Date(p.paymentDate), data: p })),
    ...tasks.map((t) => ({ type: "TASK" as const, date: new Date(t.dueDate), data: t })),
  ];

  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-blue-600" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
          Единая лента событий (Таймлайн)
        </h4>
      </div>

      {/* Note input form */}
      {canAddNote && (
        <form onSubmit={handleAddNote} className="space-y-2">
          <div className="relative">
            <textarea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Написать примечание или результат звонка..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm resize-none"
            />
            <button
              type="submit"
              disabled={loading || !content.trim()}
              className="absolute right-2.5 bottom-3.5 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all disabled:opacity-40 cursor-pointer"
              title="Отправить примечание"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
        </form>
      )}

      {/* Events timeline */}
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {events.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            В ленте пока нет записей и событий
          </div>
        ) : (
          events.map((event, index) => {
            if (event.type === "NOTE") {
              const note = event.data;
              return (
                <div key={`note-${note.id}`} className="relative group">
                  <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-blue-100 text-blue-700 border-2 border-white flex items-center justify-center shrink-0 shadow-sm">
                    <FileText className="w-2.5 h-2.5" />
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-1 font-semibold text-slate-700">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>{note.author.name}</span>
                        {note.author.role === "ADMIN" && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded">
                            Админ
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(note.createdAt)}
                      </span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap">{note.content}</p>
                  </div>
                </div>
              );
            }

            if (event.type === "PAYMENT") {
              const payment = event.data;
              return (
                <div key={`payment-${payment.id}`} className="relative group">
                  <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border-2 border-white flex items-center justify-center shrink-0 shadow-sm">
                    <CreditCard className="w-2.5 h-2.5" />
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/80 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-800 flex items-center gap-1">
                        Оплата получена
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(payment.paymentDate)}
                      </span>
                    </div>
                    <div className="text-sm font-black text-emerald-600">
                      +{formatCurrency(payment.amount, payment.currency)}
                      {payment.currency !== "KZT" && (
                        <span className="text-xs text-slate-500 font-normal ml-1.5">
                          (≈ {formatCurrency(payment.amountInBaseCurrency, "KZT")})
                        </span>
                      )}
                    </div>
                    {payment.comment && (
                      <p className="text-[11px] text-slate-600 italic">{payment.comment}</p>
                    )}
                  </div>
                </div>
              );
            }

            if (event.type === "DEAL") {
              const deal = event.data;
              return (
                <div key={`deal-${deal.id}`} className="relative group">
                  <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 border-2 border-white flex items-center justify-center shrink-0 shadow-sm">
                    <Briefcase className="w-2.5 h-2.5" />
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Сделка: {deal.title}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(deal.createdAt)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Воронка: <strong>{deal.pipeline.name}</strong> • Этап:{" "}
                      <span
                        className="font-semibold"
                        style={{ color: deal.stage.color }}
                      >
                        {deal.stage.name}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-blue-600 pt-0.5">
                      Бюджет: {formatCurrency(deal.totalBudget, deal.currency)}
                    </div>
                  </div>
                </div>
              );
            }

            if (event.type === "TASK") {
              const task = event.data;
              return (
                <div key={`task-${task.id}`} className="relative group">
                  <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-amber-100 text-amber-700 border-2 border-white flex items-center justify-center shrink-0 shadow-sm">
                    <CheckSquare className="w-2.5 h-2.5" />
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        Задача: {task.title}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                          task.isCompleted
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {task.isCompleted ? "Выполнено" : "Дедлайн"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Срок: {formatDate(task.dueDate)}</span>
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })
        )}
      </div>
    </div>
  );
}
