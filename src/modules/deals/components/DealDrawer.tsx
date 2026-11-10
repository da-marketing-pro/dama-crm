"use client";

import { useState } from "react";
import { DealItem, PaymentItem, TaskItem } from "../types";
import { updateDeal, deleteDeal } from "../actions";
import { addPayment, deletePayment } from "@/modules/payments/actions";
import { createTask, completeTask } from "@/modules/tasks/actions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Currency, StageType } from "@prisma/client";
import { EmbeddedWhatsappChat } from "@/modules/whatsapp/components/EmbeddedWhatsappChat";
import {
  X,
  CreditCard,
  CheckSquare,
  Plus,
  Trash2,
  Building,
  Phone,
  User,
  Calendar,
  Clock,
  Save,
  Check,
  AlertCircle,
  Briefcase,
  DollarSign,
  Send,
  MessageSquare,
  MessageCircle,
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

interface DealDrawerProps {
  deal: DealItem | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
  pipelines: PipelineInfo[];
  onDealDeleted?: () => void;
  onDealUpdated?: () => void;
}

export function DealDrawer({
  deal,
  isOpen,
  onClose,
  isAdmin,
  currentUserId,
  users,
  pipelines,
  onDealDeleted,
  onDealUpdated,
}: DealDrawerProps) {
  if (!isOpen || !deal) return null;

  const canEdit = isAdmin || deal.assignedTo?.name === undefined || deal.assignedTo?.role !== undefined;

  // Basic deal state
  const [title, setTitle] = useState(deal.title);
  const [budget, setBudget] = useState(deal.totalBudget.toString());
  const [currency, setCurrency] = useState<Currency>(deal.currency);
  const [stageId, setStageId] = useState(deal.stageId);
  const [assignedToId, setAssignedToId] = useState(deal.assignedToId || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payments / Tranches state
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>(deal.currency);
  const [paymentComment, setPaymentComment] = useState("");
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  // Tasks state
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("CALL");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignedId, setTaskAssignedId] = useState(currentUserId);
  const [isTaskLoading, setIsTaskLoading] = useState(false);

  // Complete task with comment dialog
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completionComment, setCompletionComment] = useState("");
  const [dealRightTab, setDealRightTab] = useState<"finance" | "whatsapp">("finance");

  const currentPipeline = pipelines.find((p) => p.id === deal.pipelineId);

  // Financial calculations
  const totalPaid = deal.payments.reduce((sum, p) => sum + p.amount, 0);
  const budgetNum = parseFloat(budget) || 0;
  const remainingBudget = Math.max(0, budgetNum - totalPaid);
  const percentPaid = budgetNum > 0 ? Math.min(100, Math.round((totalPaid / budgetNum) * 100)) : 0;

  // 1. Save Basic Deal Info
  const handleSaveDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const res = await updateDeal(deal.id, {
      title,
      totalBudget: parseFloat(budget) || 0,
      currency,
      stageId,
      assignedToId: isAdmin ? assignedToId : undefined,
    });

    setIsSaving(false);
    if (!res.success) {
      setError(res.error || "Ошибка сохранения");
    } else {
      setSaveSuccess(true);
      if (onDealUpdated) onDealUpdated();
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // 2. Add Payment / Tranche
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(paymentAmount);
    if (!amountNum || amountNum <= 0) return;

    setIsPaymentLoading(true);
    setError(null);

    const res = await addPayment(deal.id, {
      amount: amountNum,
      currency: paymentCurrency,
      comment: paymentComment.trim() || undefined,
    });

    setIsPaymentLoading(false);
    if (!res.success) {
      setError(res.error || "Ошибка добавления платежа");
    } else {
      setPaymentAmount("");
      setPaymentComment("");
      setIsAddingPayment(false);
      if (onDealUpdated) onDealUpdated();
    }
  };

  // 3. Delete Payment (Admin only)
  const handleDeletePayment = async (paymentId: string) => {
    if (!isAdmin) return;
    if (!confirm("Удалить этот платеж (транш)?")) return;

    const res = await deletePayment(paymentId);
    if (!res.success) {
      setError(res.error || "Ошибка удаления платежа");
    } else if (onDealUpdated) {
      onDealUpdated();
    }
  };

  // 4. Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDueDate) return;

    setIsTaskLoading(true);
    setError(null);

    const res = await createTask({
      title: taskTitle.trim(),
      taskType,
      dueDate: taskDueDate,
      dealId: deal.id,
      contactId: deal.contactId,
      assignedToId: taskAssignedId,
    });

    setIsTaskLoading(false);
    if (!res.success) {
      setError(res.error || "Ошибка создания задачи");
    } else {
      setTaskTitle("");
      setTaskDueDate("");
      setIsAddingTask(false);
      if (onDealUpdated) onDealUpdated();
    }
  };

  // 5. Complete Task
  const handleCompleteTask = async (taskId: string) => {
    const res = await completeTask(taskId, completionComment.trim() || undefined);
    setCompletingTaskId(null);
    setCompletionComment("");
    if (!res.success) {
      setError(res.error || "Ошибка завершения задачи");
    } else if (onDealUpdated) {
      onDealUpdated();
    }
  };

  // 6. Delete Deal (Admin only)
  const handleDeleteDeal = async () => {
    if (!isAdmin) return;
    if (!confirm(`Безвозвратно удалить сделку «${deal.title}»?`)) return;

    const res = await deleteDeal(deal.id);
    if (!res.success) {
      setError(res.error || "Ошибка удаления сделки");
    } else {
      if (onDealDeleted) onDealDeleted();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* Drawer */}
      <div className="absolute inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-blue-500/20">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 truncate max-w-md">
                  {deal.title}
                </h2>
                <span className="text-[10px] text-slate-400 font-mono">#{deal.id.slice(-6)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Создана: {formatDate(deal.createdAt)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-Columns Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {/* Left Column (5/12): Deal Meta & Contact */}
          <div className="md:col-span-5 p-6 space-y-5 overflow-y-auto">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Linked Contact Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Клиент сделки
                </span>
                <button
                  type="button"
                  onClick={() => setDealRightTab("whatsapp")}
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Чат WhatsApp</span>
                </button>
              </div>
              <div className="font-bold text-xs text-slate-900">{deal.contact.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Phone className="w-3 h-3 text-slate-400" />
                <span>{deal.contact.phone}</span>
              </div>
              {deal.contact.company && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Building className="w-3 h-3 text-slate-400" />
                  <span>{deal.contact.company}</span>
                </div>
              )}
            </div>

            {/* Deal Settings Form */}
            <form onSubmit={handleSaveDeal} className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Параметры сделки
                </span>
                {saveSuccess && (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Сохранено
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Название сделки *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Stage selector */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Этап в воронке
                </label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  {currentPipeline?.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Budget & Currency */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Бюджет сделки
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Валюта
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="KZT">KZT (₸)</option>
                    <option value="USD">USD ($)</option>
                    <option value="RUB">RUB (₽)</option>
                  </select>
                </div>
              </div>

              {/* Responsible user */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ответственный менеджер
                </label>
                <select
                  disabled={!isAdmin}
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-70"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? "Сохранение..." : "Сохранить параметры"}</span>
                </button>
              </div>
            </form>

            {/* Admin Delete Deal */}
            {isAdmin && (
              <div className="pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleDeleteDeal}
                  className="w-full py-2 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Удалить сделку (Админ)</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column (7/12): Payments (Tranches) & Tasks OR WhatsApp */}
          <div className="md:col-span-7 p-6 space-y-6 overflow-y-auto bg-slate-50/50">
            {/* Tab Navigation: Finance & Tasks vs WhatsApp */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDealRightTab("finance")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    dealRightTab === "finance"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Транши и задачи ({deal.payments.length + deal.tasks.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDealRightTab("whatsapp")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    dealRightTab === "whatsapp"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Чат WhatsApp</span>
                </button>
              </div>
            </div>

            {dealRightTab === "whatsapp" ? (
              <EmbeddedWhatsappChat
                dealId={deal.id}
                contactId={deal.contactId}
                contactPhone={deal.contact?.phone || ""}
                contactName={deal.contact?.name || deal.title}
              />
            ) : (
              <>
                {/* 1. TRANCHES & PAYMENTS WIDGET */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Учет траншей (частичных оплат)
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAddingPayment(!isAddingPayment)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAddingPayment ? "Скрыть" : "+ Добавить платеж"}</span>
                    </button>
                  </div>

              {/* Progress Bar Widget */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Оплачено:{" "}
                    <strong className="text-emerald-600 font-bold">
                      {formatCurrency(totalPaid, deal.currency)}
                    </strong>{" "}
                    из {formatCurrency(budgetNum, deal.currency)}
                  </span>
                  <span className="font-bold text-slate-800">{percentPaid}%</span>
                </div>

                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${percentPaid}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>
                    Остаток к оплате:{" "}
                    <strong className="text-slate-700">
                      {formatCurrency(remainingBudget, deal.currency)}
                    </strong>
                  </span>
                  <span>Платежей: {deal.payments.length}</span>
                </div>
              </div>

              {/* Add Payment Form */}
              {isAddingPayment && (
                <form
                  onSubmit={handleAddPayment}
                  className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="text-xs font-bold text-emerald-900">
                    Новый транш оплаты
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-0.5">
                        Сумма оплаты *
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        step="any"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="500000"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-0.5">
                        Валюта платежа
                      </label>
                      <select
                        value={paymentCurrency}
                        onChange={(e) => setPaymentCurrency(e.target.value as Currency)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium"
                      >
                        <option value="KZT">KZT (₸)</option>
                        <option value="USD">USD ($)</option>
                        <option value="RUB">RUB (₽)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Комментарий / Назначение
                    </label>
                    <input
                      type="text"
                      value={paymentComment}
                      onChange={(e) => setPaymentComment(e.target.value)}
                      placeholder="Аванс 50%, безналичный расчет"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingPayment(false)}
                      className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isPaymentLoading}
                      className="px-4 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {isPaymentLoading ? "Сохранение..." : "Зафиксировать платеж"}
                    </button>
                  </div>
                </form>
              )}

              {/* Payments List */}
              <div className="space-y-2">
                {deal.payments.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    Транши оплат еще не вносились
                  </div>
                ) : (
                  deal.payments.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-bold text-emerald-600">
                          +{formatCurrency(p.amount, p.currency)}
                          {p.currency !== "KZT" && (
                            <span className="text-[11px] text-slate-400 font-normal ml-1">
                              (≈ {formatCurrency(p.amountInBaseCurrency, "KZT")})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                          <span>{formatDate(p.paymentDate)}</span>
                          {p.comment && (
                            <>
                              <span>•</span>
                              <span className="italic text-slate-600">{p.comment}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Удалить платеж (только Админ)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. TASKS BLOCK */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Задачи по сделке ({deal.tasks.length})
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingTask(!isAddingTask)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingTask ? "Скрыть" : "+ Поставить задачу"}</span>
                </button>
              </div>

              {/* Add Task Form */}
              {isAddingTask && (
                <form
                  onSubmit={handleCreateTask}
                  className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="text-xs font-bold text-blue-900">
                    Новая задача
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Название задачи *
                    </label>
                    <input
                      type="text"
                      required
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Например: Созвониться для согласования КП"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-0.5">Тип</label>
                      <select
                        value={taskType}
                        onChange={(e) => setTaskType(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="CALL">Звонок</option>
                        <option value="MEETING">Встреча</option>
                        <option value="OFFER">Отправить КП</option>
                        <option value="PAYMENT">Контроль оплаты</option>
                        <option value="OTHER">Другое</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-0.5">Дедлайн *</label>
                      <input
                        type="datetime-local"
                        required
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-0.5">Ответственный</label>
                      <select
                        value={taskAssignedId}
                        onChange={(e) => setTaskAssignedId(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingTask(false)}
                      className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isTaskLoading}
                      className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {isTaskLoading ? "Создание..." : "Поставить задачу"}
                    </button>
                  </div>
                </form>
              )}

              {/* Task Completion Dialog Box */}
              {completingTaskId && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2 animate-in fade-in">
                  <div className="font-bold text-amber-900">
                    Завершение задачи: укажите результат выполнения
                  </div>
                  <input
                    type="text"
                    value={completionComment}
                    onChange={(e) => setCompletionComment(e.target.value)}
                    placeholder="Например: Клиент подтвердил КП, договор подписан"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 bg-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCompletingTaskId(null)}
                      className="px-2.5 py-1 rounded-lg border text-slate-600 hover:bg-slate-100"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompleteTask(completingTaskId)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                    >
                      Подтвердить выполнение
                    </button>
                  </div>
                </div>
              )}

              {/* Tasks List */}
              <div className="space-y-2">
                {deal.tasks.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    По этой сделке нет запланированных задач
                  </div>
                ) : (
                  deal.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                        task.isCompleted
                          ? "bg-slate-50 border-slate-200 opacity-60"
                          : "bg-white border-slate-200 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={task.isCompleted}
                          disabled={task.isCompleted}
                          onChange={() => setCompletingTaskId(task.id)}
                          className="mt-0.5 rounded text-blue-600 cursor-pointer"
                        />
                        <div>
                          <div
                            className={`font-semibold text-slate-900 ${
                              task.isCompleted ? "line-through text-slate-400" : ""
                            }`}
                          >
                            {task.title}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{formatDate(task.dueDate)}</span>
                            </span>
                            <span>•</span>
                            <span>{task.assignedTo.name}</span>
                          </div>
                          {task.resultComment && (
                            <p className="text-[11px] text-emerald-700 italic mt-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              Результат: {task.resultComment}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          task.isCompleted
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {task.isCompleted ? "Выполнено" : "В работе"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}
