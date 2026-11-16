"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  DealItem,
  DealNoteItem,
  DealCustomFieldDef,
  TaskItem,
  PaymentItem,
} from "../types";
import {
  getDealFieldDefinitionsAction,
  createDealFieldDefinitionAction,
  deleteDealFieldDefinitionAction,
  updateDealFullAction,
  addDealNoteAction,
  deleteDeal,
  moveDealStage,
  moveDealPipeline,
} from "../actions";
import { addPayment, deletePayment } from "@/modules/payments/actions";
import { createTask, completeTask } from "@/modules/tasks/actions";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { buildDealSourceOptions } from "@/lib/dealSource";
import { Currency, StageType } from "@prisma/client";
import { EmbeddedWhatsappChat } from "@/modules/whatsapp/components/EmbeddedWhatsappChat";
import { DealFieldSettingsModal } from "./DealFieldSettingsModal";
import { EditTaskModal, TaskEditableData } from "@/modules/tasks/components/EditTaskModal";
import {
  ChevronLeft,
  X,
  MoreHorizontal,
  Tag,
  Settings,
  Calendar,
  DollarSign,
  Check,
  CheckSquare,
  Square,
  Clock,
  User,
  Users,
  Building2,
  Phone,
  Mail,
  Briefcase,
  MessageCircle,
  Plus,
  Trash2,
  Paperclip,
  Search,
  AlertCircle,
  ExternalLink,
  Send,
  ChevronDown,
  CreditCard,
  MessageSquare,
  FileText,
  BarChart3,
  GripVertical,
  Sliders,
  Paperclip as AttachmentIcon,
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
  sourceOptions?: string[];
  initialFieldDefinitions?: DealCustomFieldDef[];
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
  sourceOptions,
  initialFieldDefinitions,
  onDealDeleted,
  onDealUpdated,
}: DealDrawerProps) {
  if (!isOpen || !deal) return null;

  // Active Tab on left side: Основное | Статистика | Файлы | Настроить
  const [leftTab, setLeftTab] = useState<"general" | "stats" | "files" | "settings">("general");

  // Mobile Active Column Switcher: "left" (Deal & Contact) vs "right" (Feed, Tasks, Chat)
  const [mobileActiveTab, setMobileActiveTab] = useState<"left" | "right">("left");

  // Right column view: feed or full WhatsApp
  const [rightView, setRightView] = useState<"feed" | "whatsapp">("feed");

  // Search filter for timeline
  const [feedSearch, setFeedSearch] = useState("");

  // Composer mode on right side: note | task | payment | chat
  const [composerMode, setComposerMode] = useState<"note" | "task" | "payment" | "chat">("note");

  // Deal fields state
  const [title, setTitle] = useState(deal.title);
  const [budget, setBudget] = useState(deal.totalBudget.toString());
  const [currency, setCurrency] = useState<Currency>(deal.currency);
  const [pipelineId, setPipelineId] = useState(deal.pipelineId);
  const [stageId, setStageId] = useState(deal.stageId);
  const [source, setSource] = useState(deal.source || "");
  const [assignedToId, setAssignedToId] = useState(deal.assignedToId || "");
  const [dealCustomFields, setDealCustomFields] = useState<Record<string, unknown>>(
    (deal.customFields as Record<string, unknown>) || {}
  );

  // Contact fields state
  const [contactName, setContactName] = useState(deal.contact.name || "");
  const [contactCompany, setContactCompany] = useState(deal.contact.company || "");
  const [contactPhone, setContactPhone] = useState(deal.contact.phone || "");
  const [contactEmail, setContactEmail] = useState(deal.contact.email || "");
  const [contactCustomFields, setContactCustomFields] = useState<Record<string, unknown>>(
    (deal.contact.customFields as Record<string, unknown>) || {}
  );

  // Field Settings Modal state
  const [isFieldSettingsOpen, setIsFieldSettingsOpen] = useState(false);
  const [customDealDefs, setCustomDealDefs] = useState<DealCustomFieldDef[]>(
    initialFieldDefinitions?.filter((f) => f.entityType === "DEAL") || []
  );
  const [customContactDefs, setCustomContactDefs] = useState<DealCustomFieldDef[]>(
    initialFieldDefinitions?.filter((f) => f.entityType === "CONTACT") || []
  );

  // In-Card Field Settings State (amoCRM tab)
  const [settingsGroupTab, setSettingsGroupTab] = useState<"general" | "stats" | "files">("general");
  const [inlineAddingTarget, setInlineAddingTarget] = useState<"DEAL" | "CONTACT" | null>(null);
  const [inlineNewFieldName, setInlineNewFieldName] = useState("");
  const [inlineNewFieldType, setInlineNewFieldType] = useState<"TEXT" | "NUMBER" | "DATE" | "SELECT">("TEXT");
  const [inlineNewFieldOptions, setInlineNewFieldOptions] = useState("");
  const [isInlineSubmitting, setIsInlineSubmitting] = useState(false);
  const [inlineFieldError, setInlineFieldError] = useState<string | null>(null);

  // Stage dropdown selector state
  const [isStageMenuOpen, setIsStageMenuOpen] = useState(false);
  const [isMovingStage, setIsMovingStage] = useState(false);
  const stageMenuRef = useRef<HTMLDivElement>(null);

  // Close stage dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (stageMenuRef.current && !stageMenuRef.current.contains(event.target as Node)) {
        setIsStageMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Modal to edit task parameters (date, time, type)
  const [editingTask, setEditingTask] = useState<TaskEditableData | null>(null);

  // Actions & Feed state
  const [notes, setNotes] = useState<DealNoteItem[]>(deal.contact.notes || []);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [isNoteSubmitting, setIsNoteSubmitting] = useState(false);

  // Task creation state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("CALL");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignedId, setTaskAssignedId] = useState(currentUserId);
  const [isTaskSubmitting, setIsTaskSubmitting] = useState(false);

  // Task completion state
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completionComment, setCompletionComment] = useState("");

  // Payment creation state
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>(deal.currency);
  const [paymentComment, setPaymentComment] = useState("");
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);

  // Global save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Fetch field definitions on mount or modal close
  const reloadFieldDefs = async () => {
    const res = await getDealFieldDefinitionsAction();
    if (res.success) {
      setCustomDealDefs(res.dealFields);
      setCustomContactDefs(res.contactFields);
    }
  };

  useEffect(() => {
    reloadFieldDefs();
  }, []);

  const currentPipeline = pipelines.find((p) => p.id === pipelineId) || pipelines[0];
  const currentStage = currentPipeline?.stages.find((s) => s.id === stageId) || currentPipeline?.stages[0];

  // Moving deal to a specific stage
  const handleStageSelect = async (targetStageId: string) => {
    if (targetStageId === stageId || isMovingStage) return;
    setIsMovingStage(true);
    setErrorMessage(null);
    const prevStageId = stageId;
    setStageId(targetStageId);

    try {
      const res = await moveDealStage(deal.id, targetStageId);
      if (!res.success) {
        setStageId(prevStageId);
        setErrorMessage(res.error || "Ошибка перемещения сделки на новый этап");
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        onDealUpdated?.();
      }
    } catch (err: unknown) {
      setStageId(prevStageId);
      setErrorMessage(err instanceof Error ? err.message : "Ошибка перемещения сделки");
    } finally {
      setIsMovingStage(false);
    }
  };

  // Moving deal to another pipeline
  const handlePipelineSelect = async (targetPipelineId: string) => {
    if (targetPipelineId === pipelineId || isMovingStage) return;
    setIsMovingStage(true);
    setErrorMessage(null);
    const prevPipelineId = pipelineId;
    const prevStageId = stageId;

    const targetPipe = pipelines.find((p) => p.id === targetPipelineId);
    const defaultStage =
      targetPipe?.stages.find((s) => s.type === StageType.OPEN) || targetPipe?.stages[0];

    setPipelineId(targetPipelineId);
    if (defaultStage) setStageId(defaultStage.id);

    try {
      const res = await moveDealPipeline(deal.id, targetPipelineId, defaultStage?.id);
      if (!res.success) {
        setPipelineId(prevPipelineId);
        setStageId(prevStageId);
        setErrorMessage(res.error || "Ошибка перемещения сделки в другую воронку");
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        onDealUpdated?.();
      }
    } catch (err: unknown) {
      setPipelineId(prevPipelineId);
      setStageId(prevStageId);
      setErrorMessage(err instanceof Error ? err.message : "Ошибка перемещения сделки");
    } finally {
      setIsMovingStage(false);
    }
  };

  // In-Card Field Definition Creation
  const handleInlineAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineNewFieldName.trim() || !inlineAddingTarget) return;

    setIsInlineSubmitting(true);
    setInlineFieldError(null);

    const optionsArray =
      inlineNewFieldType === "SELECT"
        ? inlineNewFieldOptions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const res = await createDealFieldDefinitionAction({
      entityType: inlineAddingTarget,
      name: inlineNewFieldName.trim(),
      fieldType: inlineNewFieldType,
      options: optionsArray,
    });

    setIsInlineSubmitting(false);
    if (!res.success) {
      setInlineFieldError(res.error || "Ошибка создания поля");
    } else {
      setInlineNewFieldName("");
      setInlineNewFieldOptions("");
      setInlineNewFieldType("TEXT");
      setInlineAddingTarget(null);
      await reloadFieldDefs();
    }
  };

  // In-Card Field Definition Deletion
  const handleInlineDeleteField = async (fieldId: string, fieldName: string) => {
    if (!isAdmin) return;
    if (!confirm(`Удалить поле «${fieldName}»? Данные этого поля перестанут отображаться.`)) return;

    const res = await deleteDealFieldDefinitionAction(fieldId);
    if (!res.success) {
      alert(res.error || "Ошибка удаления поля");
    } else {
      await reloadFieldDefs();
    }
  };

  // Full Save Action (deals + contacts + custom fields)
  const handleSaveFull = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    const res = await updateDealFullAction(deal.id, {
      title,
      totalBudget: parseFloat(budget) || 0,
      currency,
      pipelineId,
      stageId,
      source,
      assignedToId: isAdmin ? assignedToId : undefined,
      customFields: dealCustomFields,
      contact: {
        id: deal.contactId,
        name: contactName,
        company: contactCompany || null,
        phone: contactPhone,
        email: contactEmail || null,
        customFields: contactCustomFields,
      },
    });

    setIsSaving(false);
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка сохранения сделки");
    } else {
      setSaveSuccess(true);
      if (onDealUpdated) onDealUpdated();
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  // Add Note to Timeline
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !deal.contactId) return;

    setIsNoteSubmitting(true);
    setErrorMessage(null);

    const res = await addDealNoteAction(deal.contactId, newNoteContent.trim());
    setIsNoteSubmitting(false);

    if (!res.success || !res.note) {
      setErrorMessage(res.error || "Ошибка добавления примечания");
    } else {
      setNotes((prev) => [res.note as DealNoteItem, ...prev]);
      setNewNoteContent("");
      if (onDealUpdated) onDealUpdated();
    }
  };

  // Create Task from Composer
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDueDate) return;

    setIsTaskSubmitting(true);
    setErrorMessage(null);

    // Convert local datetime input to ISO or rely on server parseClientDueDate
    const resolvedDueDate = taskDueDate.includes("Z") || taskDueDate.includes("+")
      ? taskDueDate
      : new Date(taskDueDate).toISOString();

    const res = await createTask({
      title: taskTitle.trim(),
      taskType,
      dueDate: resolvedDueDate,
      dealId: deal.id,
      contactId: deal.contactId,
      assignedToId: taskAssignedId,
    });

    setIsTaskSubmitting(false);
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка создания задачи");
    } else {
      setTaskTitle("");
      setTaskDueDate("");
      setComposerMode("note");
      if (onDealUpdated) onDealUpdated();
    }
  };

  // Complete Task
  const handleCompleteTask = async (taskId: string) => {
    const res = await completeTask(taskId, completionComment.trim() || undefined);
    setCompletingTaskId(null);
    setCompletionComment("");
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка завершения задачи");
    } else if (onDealUpdated) {
      onDealUpdated();
    }
  };

  // Add Payment from Composer
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(paymentAmount);
    if (!amountNum || amountNum <= 0) return;

    setIsPaymentSubmitting(true);
    setErrorMessage(null);

    const res = await addPayment(deal.id, {
      amount: amountNum,
      currency: paymentCurrency,
      comment: paymentComment.trim() || undefined,
    });

    setIsPaymentSubmitting(false);
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка добавления платежа");
    } else {
      setPaymentAmount("");
      setPaymentComment("");
      setComposerMode("note");
      if (onDealUpdated) onDealUpdated();
    }
  };

  // Delete Payment
  const handleDeletePayment = async (paymentId: string) => {
    if (!isAdmin) return;
    if (!confirm("Удалить этот платеж (транш)?")) return;

    const res = await deletePayment(paymentId);
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка удаления платежа");
    } else if (onDealUpdated) {
      onDealUpdated();
    }
  };

  // Delete Deal (Admin)
  const handleDeleteDeal = async () => {
    if (!isAdmin) return;
    if (!confirm(`Безвозвратно удалить сделку «${deal.title}»?`)) return;

    const res = await deleteDeal(deal.id);
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка удаления сделки");
    } else {
      if (onDealDeleted) onDealDeleted();
      onClose();
    }
  };

  // Financial calculations
  const totalPaid = deal.payments.reduce((sum, p) => sum + p.amount, 0);
  const budgetNum = parseFloat(budget) || 0;
  const remainingBudget = Math.max(0, budgetNum - totalPaid);

  // Grouped Timeline Items (Notes + Tasks + Payments)
  const timelineItems = useMemo(() => {
    const items: Array<{
      id: string;
      date: Date;
      type: "note" | "audit" | "task" | "payment";
      authorName?: string;
      content: string;
      meta?: any;
    }> = [];

    // Notes & audit events
    notes.forEach((n) => {
      const isAudit = n.content.includes("установлено значение") || n.content.includes("изменено") || n.content.includes("перемещена");
      items.push({
        id: `note-${n.id}`,
        date: new Date(n.createdAt),
        type: isAudit ? "audit" : "note",
        authorName: n.author?.name || "Менеджер",
        content: n.content,
      });
    });

    // Tasks
    deal.tasks.forEach((t) => {
      items.push({
        id: `task-${t.id}`,
        date: new Date(t.dueDate),
        type: "task",
        authorName: t.assignedTo?.name || "Ответственный",
        content: t.title,
        meta: t,
      });
    });

    // Payments
    deal.payments.forEach((p) => {
      items.push({
        id: `payment-${p.id}`,
        date: new Date(p.paymentDate),
        type: "payment",
        authorName: "Бухгалтерия / CRM",
        content: `Оплата: ${formatCurrency(p.amount, p.currency)}${p.comment ? ` (${p.comment})` : ""}`,
        meta: p,
      });
    });

    // Sort descending (newest first)
    items.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Search filter
    if (feedSearch.trim()) {
      const q = feedSearch.toLowerCase();
      return items.filter(
        (it) =>
          it.content.toLowerCase().includes(q) ||
          it.authorName?.toLowerCase().includes(q)
      );
    }

    return items;
  }, [notes, deal.tasks, deal.payments, feedSearch]);

  // Standard AmoCRM static fields reference
  const standardDealFields = useMemo(() => [
    { name: "Бюджет сделки", badge: "₸0" },
    { name: "Тип маркетинга", badge: "6 вариантов" },
    { name: "Дата запуска кампании", badge: "Дата" },
    { name: "Бюджет кампании", badge: "Число" },
    { name: "Тип клиента", badge: "3 варианта" },
    { name: "Требуется согласование", badge: "Чекбокс" },
    { name: "Комментарии менеджера", badge: "Текст" },
    { name: "Источник", badge: "Список" },
  ], []);

  const standardContactFields = useMemo(() => [
    { name: "Имя контакта", badge: "Текст" },
    { name: "Телефон", badge: "Телефон" },
    { name: "Email", badge: "Email" },
    { name: "Должность", badge: "Текст" },
  ], []);

  const standardCompanyFields = useMemo(() => [
    { name: "Название компании", badge: "Текст" },
    { name: "Телефон компании", badge: "Телефон" },
    { name: "Email компании", badge: "Email" },
  ], []);

  const filteredCustomDealFields = useMemo(() => {
    const stdSet = new Set(standardDealFields.map((f) => f.name.toLowerCase()));
    return customDealDefs.filter((f) => !stdSet.has(f.name.toLowerCase()));
  }, [customDealDefs, standardDealFields]);

  const filteredCustomContactFields = useMemo(() => {
    const stdSet = new Set(standardContactFields.map((f) => f.name.toLowerCase()));
    return customContactDefs.filter((f) => !stdSet.has(f.name.toLowerCase()));
  }, [customContactDefs, standardContactFields]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-stretch justify-end h-[100dvh] max-h-[100dvh]">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[#070e17]/80 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* amoCRM Dark Main Drawer */}
      <div className="relative w-full max-w-[1280px] bg-[#0f1d2b] text-slate-200 shadow-2xl flex flex-col border-l border-[#1b324d] animate-in slide-in-from-right duration-300 z-10 font-sans h-full max-h-[100dvh] overflow-hidden">
        {/* ================= TOP HEADER (amoCRM Header) ================= */}
        <div className="h-14 px-5 bg-[#0f1d2b] border-b border-[#1b324d] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back Arrow */}
            <button
              onClick={onClose}
              title="Назад к воронке"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1b324d] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Editable Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название сделки"
              className="bg-transparent text-base md:text-lg font-bold text-white hover:bg-[#162838] focus:bg-[#162838] px-2 py-1 rounded-md border border-transparent focus:border-[#2e70e9] focus:outline-none transition-colors truncate max-w-sm md:max-w-md"
            />

            {/* #ID Badge */}
            <span className="text-xs font-mono text-slate-400 bg-[#162838] px-2 py-0.5 rounded border border-[#223c56]">
              #{deal.id.slice(-8)}
            </span>

            {/* +ТЕГИРОВАТЬ Button */}
            <button
              type="button"
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-[#162838] hover:bg-[#1e3851] border border-[#223c56] px-2.5 py-1 rounded cursor-pointer transition-colors"
            >
              <Tag className="w-3 h-3" />
              <span>+ТЕГИРОВАТЬ</span>
            </button>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2">
            {/* Save notification */}
            {saveSuccess && (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded flex items-center gap-1 animate-pulse">
                <Check className="w-3.5 h-3.5" /> Сохранено
              </span>
            )}

            {/* 3-dots Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1b324d] transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#162838] border border-[#223c56] rounded-xl shadow-2xl py-1.5 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      alert("Ссылка на сделку скопирована");
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#203a54] text-slate-300 flex items-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Скопировать ссылку</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsFieldSettingsOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#203a54] text-slate-300 flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Настройка полей (amoCRM)</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        handleDeleteDeal();
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-rose-950/50 text-rose-400 flex items-center gap-2 cursor-pointer border-t border-[#223c56]/60 mt-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить сделку (Админ)</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Close Cross */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1b324d] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= PIPELINE & STAGE PROGRESSION BAR ================= */}
        <div className="px-5 py-2.5 bg-[#122232] border-b border-[#1b324d] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Воронка */}
            <div className="relative">
              <select
                value={pipelineId}
                disabled={isMovingStage}
                onChange={(e) => handlePipelineSelect(e.target.value)}
                className="bg-[#162838] border border-[#223c56] text-white text-xs font-bold rounded-lg px-2.5 py-1.5 pr-7 hover:bg-[#1b324d] focus:border-[#2e70e9] focus:outline-none appearance-none cursor-pointer transition-colors"
                title="Воронка продаж"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
            </div>

            {/* Выпадающий список этапов (Stage Dropdown) */}
            <div className="relative" ref={stageMenuRef}>
              <button
                type="button"
                disabled={isMovingStage}
                onClick={() => setIsStageMenuOpen(!isStageMenuOpen)}
                className="bg-[#162838] border border-[#223c56] hover:border-[#2e70e9] text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-2 hover:bg-[#1b324d] transition-all cursor-pointer shadow-xs disabled:opacity-60"
                title="Нажмите, чтобы сменить этап сделки"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: currentStage?.color || "#3b82f6" }}
                />
                <span className="truncate max-w-[200px]">{currentStage?.name || "Выберите этап"}</span>
                {currentStage?.type === StageType.WON && (
                  <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 px-1.5 py-0.2 rounded font-mono">
                    Успех
                  </span>
                )}
                {currentStage?.type === StageType.LOST && (
                  <span className="text-[10px] bg-rose-950/80 text-rose-300 border border-rose-800/80 px-1.5 py-0.2 rounded font-mono">
                    Отказ
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                    isStageMenuOpen ? "rotate-180 text-white" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu of Stages */}
              {isStageMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-64 bg-[#162838] border border-[#223c56] rounded-xl shadow-2xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#223c56]/60 mb-1 flex items-center justify-between">
                    <span>Этапы воронки</span>
                    <span className="text-slate-500 font-mono text-[10px]">{currentPipeline?.stages.length || 0}</span>
                  </div>

                  <div className="max-h-72 overflow-y-auto py-0.5 space-y-0.5">
                    {currentPipeline?.stages.map((st) => {
                      const isCurrent = st.id === stageId;
                      const isWon = st.type === StageType.WON;
                      const isLost = st.type === StageType.LOST;

                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            setIsStageMenuOpen(false);
                            handleStageSelect(st.id);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                            isCurrent
                              ? "bg-[#203a54] text-white font-bold"
                              : "text-slate-300 hover:bg-[#1d354d] hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: st.color || "#60a5fa" }}
                            />
                            <span className="truncate">{st.name}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isWon && (
                              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-1.5 py-0.2 rounded font-mono">
                                Успех
                              </span>
                            )}
                            {isLost && (
                              <span className="text-[10px] bg-rose-950 text-rose-300 border border-rose-800/80 px-1.5 py-0.2 rounded font-mono">
                                Отказ
                              </span>
                            )}
                            {isCurrent && <Check className="w-3.5 h-3.5 text-blue-400" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Moving status indicator */}
            {isMovingStage && (
              <span className="text-xs text-blue-400 flex items-center gap-1.5 animate-pulse font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                Перемещение...
              </span>
            )}
          </div>

          {/* Creation date */}
          <div className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1 font-mono">
            <span>Создана:</span>
            <span className="text-slate-300">{formatDate(deal.createdAt)}</span>
          </div>
        </div>

        {/* Error Alert Bar */}
        {errorMessage && (
          <div className="px-5 py-2 bg-rose-950/80 border-b border-rose-800/80 text-rose-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Mobile View Switcher (md:hidden) */}
        <div className="md:hidden flex items-center bg-[#122232] border-b border-[#1b324d] px-3 py-2 shrink-0">
          <div className="grid grid-cols-2 w-full bg-[#162838] p-1 rounded-xl text-xs font-bold border border-[#223c56]">
            <button
              type="button"
              onClick={() => setMobileActiveTab("left")}
              className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                mobileActiveTab === "left"
                  ? "bg-[#2e70e9] text-white shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📋 Данные сделки
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveTab("right")}
              className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                mobileActiveTab === "right"
                  ? "bg-[#2e70e9] text-white shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              💬 История и чат
            </button>
          </div>
        </div>

        {/* ================= 2-COLUMN MAIN BODY ================= */}
        <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 md:grid-cols-12 md:divide-x divide-[#1b324d]">
          {/* ================= LEFT COLUMN (5/12): AmoCRM Fields & Contact ================= */}
          <div
            className={cn(
              "md:col-span-5 flex-col h-full min-h-0 overflow-hidden bg-[#0f1d2b]",
              mobileActiveTab === "left" ? "flex" : "hidden md:flex"
            )}
          >
            {/* Tabs: Основное | Статистика | Файлы | Настроить */}
            <div className="px-5 pt-3 pb-2 border-b border-[#1b324d] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setLeftTab("general")}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    leftTab === "general"
                      ? "border-[#2e70e9] text-white"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Основное
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab("stats")}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    leftTab === "stats"
                      ? "border-[#2e70e9] text-white"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Статистика
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab("files")}
                  className={`pb-1 border-b-2 transition-colors cursor-pointer ${
                    leftTab === "files"
                      ? "border-[#2e70e9] text-white"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Файлы
                </button>
              </div>

              {/* Настроить Tab / Button */}
              <button
                type="button"
                onClick={() => setLeftTab(leftTab === "settings" ? "general" : "settings")}
                className={`text-xs font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  leftTab === "settings"
                    ? "bg-[#2e70e9] text-white shadow-xs"
                    : "text-slate-400 hover:text-white hover:bg-[#162838]"
                }`}
                title="Настройка свойств полей и групп (amoCRM)"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Настроить</span>
              </button>
            </div>

            {/* Scrollable Fields Container */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* ====== TAB: НАСТРОИТЬ ПОЛЯ (amoCRM direct inline config) ====== */}
              {leftTab === "settings" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Settings Header banner */}
                  <div className="p-4 rounded-xl bg-[#142637] border border-[#223c56] flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-[#3b82f6]" />
                        <span>Настройка свойств полей и групп</span>
                      </h3>
                      <p className="text-[11px] text-[#7e9bb5] mt-1 leading-relaxed">
                        В DAMA CRM вы можете добавлять свои уникальные поля и использовать их для любых фильтров и отчетов.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLeftTab("general")}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1d354d] transition-colors cursor-pointer shrink-0"
                      title="Закрыть настройки и вернуться к карточке"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Groups / Tabs Bar (amoCRM style tabs: :: Основное, :: Статистика, :: Файлы) */}
                  <div className="px-3 py-2 bg-[#0b1723] rounded-xl border border-[#1d354d] flex items-center gap-2 overflow-x-auto text-xs">
                    <button
                      type="button"
                      onClick={() => setSettingsGroupTab("general")}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        settingsGroupTab === "general"
                          ? "bg-[#1f3b57] text-white border border-[#2e5a85] shadow-xs"
                          : "text-[#7e9bb5] hover:text-white hover:bg-[#152738]"
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-[#52779a]" />
                      <span>Основное</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettingsGroupTab("stats")}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        settingsGroupTab === "stats"
                          ? "bg-[#1f3b57] text-white border border-[#2e5a85] shadow-xs"
                          : "text-[#7e9bb5] hover:text-white hover:bg-[#152738]"
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-[#52779a]" />
                      <span>Статистика</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettingsGroupTab("files")}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        settingsGroupTab === "files"
                          ? "bg-[#1f3b57] text-white border border-[#2e5a85] shadow-xs"
                          : "text-[#7e9bb5] hover:text-white hover:bg-[#152738]"
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-[#52779a]" />
                      <span>Файлы</span>
                    </button>
                  </div>

                  {inlineFieldError && (
                    <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{inlineFieldError}</span>
                    </div>
                  )}

                  {/* Section 1: Поля сделки (Основное) */}
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#7e9bb5] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-[#3b82f6]" />
                        <span>Поля сделки (Группа «Основное»)</span>
                      </span>
                      <span className="text-[11px] font-normal text-slate-500">
                        {standardDealFields.length + filteredCustomDealFields.length} полей
                      </span>
                    </div>

                    {/* Standard Deal fields */}
                    <div className="space-y-1.5">
                      {standardDealFields.map((f) => (
                        <div
                          key={f.name}
                          className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-[#486e92] shrink-0" />
                            <span className="font-medium truncate">{f.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668] shrink-0">
                            {f.badge}
                          </span>
                        </div>
                      ))}

                      {/* Custom Deal fields */}
                      {filteredCustomDealFields.map((f) => (
                        <div
                          key={f.id}
                          className="px-3.5 py-2.5 rounded-xl bg-[#14283c] border border-blue-500/30 flex items-center justify-between gap-3 text-xs text-slate-200 hover:border-blue-500/50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="font-semibold text-white truncate">{f.name}</span>
                            <span className="text-[10px] text-blue-300 font-mono bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-800/50">
                              кастомное
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                              {f.fieldType === "SELECT"
                                ? `${f.options?.length || 0} вар.`
                                : f.fieldType === "DATE"
                                ? "Дата"
                                : f.fieldType === "NUMBER"
                                ? "Число"
                                : "Текст"}
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleInlineDeleteField(f.id, f.name)}
                                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title="Удалить поле"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Field Inline Form or Button */}
                    {inlineAddingTarget === "DEAL" ? (
                      <form
                        onSubmit={handleInlineAddField}
                        className="p-3.5 rounded-xl bg-[#162a3f] border border-[#2e5a85] space-y-3"
                      >
                        <div className="text-xs font-bold text-white flex items-center justify-between">
                          <span>Новое поле для сделки</span>
                          <button
                            type="button"
                            onClick={() => setInlineAddingTarget(null)}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[11px] text-[#7e9bb5] block mb-1">Название поля *</label>
                            <input
                              type="text"
                              required
                              placeholder="Например: Ссылка на бриф"
                              value={inlineNewFieldName}
                              onChange={(e) => setInlineNewFieldName(e.target.value)}
                              className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] text-[#7e9bb5] block mb-1">Тип поля</label>
                            <select
                              value={inlineNewFieldType}
                              onChange={(e) => setInlineNewFieldType(e.target.value as any)}
                              className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                            >
                              <option value="TEXT">Текст (строка)</option>
                              <option value="NUMBER">Число</option>
                              <option value="DATE">Дата (календарь)</option>
                              <option value="SELECT">Список (варианты)</option>
                            </select>
                          </div>
                        </div>

                        {inlineNewFieldType === "SELECT" && (
                          <div>
                            <label className="text-[11px] text-[#7e9bb5] block mb-1">
                              Варианты выбора (через запятую)
                            </label>
                            <input
                              type="text"
                              placeholder="Вариант 1, Вариант 2, Вариант 3"
                              value={inlineNewFieldOptions}
                              onChange={(e) => setInlineNewFieldOptions(e.target.value)}
                              className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setInlineAddingTarget(null)}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                          >
                            Отмена
                          </button>
                          <button
                            type="submit"
                            disabled={isInlineSubmitting || !inlineNewFieldName.trim()}
                            className="px-3.5 py-1.5 rounded-lg bg-[#2e70e9] hover:bg-[#255ec4] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                          >
                            {isInlineSubmitting ? "Сохранение..." : "Сохранить поле"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setInlineAddingTarget("DEAL");
                          setInlineNewFieldName("");
                          setInlineNewFieldOptions("");
                          setInlineNewFieldType("TEXT");
                        }}
                        className="w-full py-2.5 rounded-xl border border-dashed border-[#244668] hover:border-[#2e70e9] hover:bg-[#132537] text-xs font-semibold text-[#6891b8] hover:text-[#2e70e9] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Добавить поле</span>
                      </button>
                    )}
                  </div>

                  {/* Section 2: Поля контактов */}
                  <div className="space-y-2.5 pt-4 border-t border-[#1d354d]">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#7e9bb5] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#10b981]" />
                        <span>Поля контактов</span>
                      </span>
                      <span className="text-[11px] font-normal text-slate-500">
                        {standardContactFields.length + filteredCustomContactFields.length} полей
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {standardContactFields.map((f) => (
                        <div
                          key={f.name}
                          className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-[#486e92] shrink-0" />
                            <span className="font-medium truncate">{f.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                            {f.badge}
                          </span>
                        </div>
                      ))}

                      {filteredCustomContactFields.map((f) => (
                        <div
                          key={f.id}
                          className="px-3.5 py-2.5 rounded-xl bg-[#14283c] border border-emerald-500/30 flex items-center justify-between gap-3 text-xs text-slate-200"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="font-semibold text-white truncate">{f.name}</span>
                            <span className="text-[10px] text-emerald-300 font-mono bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/50">
                              кастомное
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                              {f.fieldType === "SELECT" ? "Список" : f.fieldType === "DATE" ? "Дата" : f.fieldType === "NUMBER" ? "Число" : "Текст"}
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleInlineDeleteField(f.id, f.name)}
                                className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                                title="Удалить поле"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {inlineAddingTarget === "CONTACT" ? (
                      <form
                        onSubmit={handleInlineAddField}
                        className="p-3.5 rounded-xl bg-[#162a3f] border border-[#2e5a85] space-y-3"
                      >
                        <div className="text-xs font-bold text-white flex items-center justify-between">
                          <span>Новое поле для контакта</span>
                          <button
                            type="button"
                            onClick={() => setInlineAddingTarget(null)}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[11px] text-[#7e9bb5] block mb-1">Название поля *</label>
                            <input
                              type="text"
                              required
                              placeholder="Например: Telegram username"
                              value={inlineNewFieldName}
                              onChange={(e) => setInlineNewFieldName(e.target.value)}
                              className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-[#7e9bb5] block mb-1">Тип поля</label>
                            <select
                              value={inlineNewFieldType}
                              onChange={(e) => setInlineNewFieldType(e.target.value as any)}
                              className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                            >
                              <option value="TEXT">Текст (строка)</option>
                              <option value="NUMBER">Число</option>
                              <option value="DATE">Дата (календарь)</option>
                              <option value="SELECT">Список</option>
                            </select>
                          </div>
                        </div>

                        {inlineNewFieldType === "SELECT" && (
                          <div>
                            <label className="text-[11px] text-[#7e9bb5] block mb-1">
                              Варианты (через запятую)
                            </label>
                            <input
                              type="text"
                              placeholder="Вариант 1, Вариант 2"
                              value={inlineNewFieldOptions}
                              onChange={(e) => setInlineNewFieldOptions(e.target.value)}
                              className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setInlineAddingTarget(null)}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                          >
                            Отмена
                          </button>
                          <button
                            type="submit"
                            disabled={isInlineSubmitting || !inlineNewFieldName.trim()}
                            className="px-3.5 py-1.5 rounded-lg bg-[#2e70e9] hover:bg-[#255ec4] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                          >
                            {isInlineSubmitting ? "Сохранение..." : "Сохранить поле"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setInlineAddingTarget("CONTACT");
                          setInlineNewFieldName("");
                          setInlineNewFieldOptions("");
                          setInlineNewFieldType("TEXT");
                        }}
                        className="w-full py-2.5 rounded-xl border border-dashed border-[#244668] hover:border-[#10b981] hover:bg-[#132537] text-xs font-semibold text-[#6891b8] hover:text-[#10b981] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Добавить поле</span>
                      </button>
                    )}
                  </div>

                  {/* Section 3: Поля компаний */}
                  <div className="space-y-2.5 pt-4 border-t border-[#1d354d]">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#7e9bb5] flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#f59e0b]" />
                        <span>Поля компаний</span>
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {standardCompanyFields.map((f) => (
                        <div
                          key={f.name}
                          className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-[#486e92] shrink-0" />
                            <span className="font-medium truncate">{f.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                            {f.badge}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {leftTab === "general" && (
                <>
                  {/* ====== SECTION 1: DEAL PARAMETERS ====== */}
                  <div className="space-y-3">
                    {/* Ответственный */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Отв-ный</span>
                      <div className="col-span-7">
                        <select
                          disabled={!isAdmin}
                          value={assignedToId}
                          onChange={(e) => setAssignedToId(e.target.value)}
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none disabled:opacity-70 cursor-pointer"
                        >
                          <option value="">Не назначен</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Бюджет сделки */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Бюджет</span>
                      <div className="col-span-7 flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={budget}
                            onChange={(e) => setBudget(e.target.value)}
                            placeholder="0"
                            className="w-full bg-[#162838] border border-[#223c56] text-white font-bold text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                          />
                        </div>
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value as Currency)}
                          className="bg-[#162838] border border-[#223c56] text-slate-300 text-xs rounded px-2 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                        >
                          <option value="KZT">₸</option>
                          <option value="USD">$</option>
                          <option value="RUB">₽</option>
                        </select>
                      </div>
                    </div>

                    {/* Тип маркетинга */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Тип маркетинга</span>
                      <div className="col-span-7">
                        <select
                          value={(dealCustomFields["Тип маркетинга"] as string) || ""}
                          onChange={(e) =>
                            setDealCustomFields((prev) => ({
                              ...prev,
                              "Тип маркетинга": e.target.value,
                            }))
                          }
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                        >
                          <option value="">...</option>
                          <option value="Контекстная реклама">Контекстная реклама</option>
                          <option value="Таргетированная реклама">Таргетированная реклама</option>
                          <option value="Комплексный маркетинг">Комплексный маркетинг</option>
                          <option value="SEO продвижение">SEO продвижение</option>
                          <option value="Автообзвон">Автообзвон</option>
                          <option value="Разработка сайтов">Разработка сайтов</option>
                        </select>
                      </div>
                    </div>

                    {/* Дата запуска кампании */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Дата запуска</span>
                      <div className="col-span-7">
                        <input
                          type="date"
                          value={(dealCustomFields["Дата запуска кампании"] as string) || ""}
                          onChange={(e) =>
                            setDealCustomFields((prev) => ({
                              ...prev,
                              "Дата запуска кампании": e.target.value,
                            }))
                          }
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Бюджет кампании */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Бюджет кампании</span>
                      <div className="col-span-7">
                        <input
                          type="number"
                          placeholder="..."
                          value={(dealCustomFields["Бюджет кампании"] as string) || ""}
                          onChange={(e) =>
                            setDealCustomFields((prev) => ({
                              ...prev,
                              "Бюджет кампании": e.target.value,
                            }))
                          }
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Тип клиента */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Тип клиента</span>
                      <div className="col-span-7">
                        <select
                          value={(dealCustomFields["Тип клиента"] as string) || "Новый клиент"}
                          onChange={(e) =>
                            setDealCustomFields((prev) => ({
                              ...prev,
                              "Тип клиента": e.target.value,
                            }))
                          }
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                        >
                          <option value="Новый клиент">Новый клиент</option>
                          <option value="Повторный клиент">Повторный клиент</option>
                          <option value="Партнер">Партнер</option>
                        </select>
                      </div>
                    </div>

                    {/* Требуется согласование (Toggle) */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Требуется согл.</span>
                      <div className="col-span-7 flex items-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!dealCustomFields["Требуется согласование"]}
                            onChange={(e) =>
                              setDealCustomFields((prev) => ({
                                ...prev,
                                "Требуется согласование": e.target.checked,
                              }))
                            }
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-[#162838] border border-[#223c56] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2e70e9]"></div>
                          <span className="ml-2 text-xs text-slate-300">
                            {dealCustomFields["Требуется согласование"] ? "Да" : "Нет"}
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Источник */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Источник</span>
                      <div className="col-span-7">
                        <select
                          value={source}
                          onChange={(e) => setSource(e.target.value)}
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                        >
                          <option value="">Не указан</option>
                          {buildDealSourceOptions(
                            source ? [...(sourceOptions || []), source] : sourceOptions
                          ).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Комментарии менеджера */}
                    <div className="grid grid-cols-12 gap-2 items-start text-xs pt-1">
                      <span className="col-span-5 text-slate-400 font-medium pt-1">Комментарии</span>
                      <div className="col-span-7">
                        <textarea
                          rows={2}
                          placeholder="..."
                          value={(dealCustomFields["Комментарии менеджера"] as string) || ""}
                          onChange={(e) =>
                            setDealCustomFields((prev) => ({
                              ...prev,
                              "Комментарии менеджера": e.target.value,
                            }))
                          }
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded p-2 focus:border-[#2e70e9] focus:outline-none resize-none"
                        />
                      </div>
                    </div>

                    {/* Дополнительные кастомные поля сделки (из настроек полей) */}
                    {customDealDefs
                      .filter(
                        (f) =>
                          ![
                            "Бюджет сделки",
                            "Тип маркетинга",
                            "Дата запуска кампании",
                            "Бюджет кампании",
                            "Тип клиента",
                            "Требуется согласование",
                            "Комментарии менеджера",
                            "Источник",
                          ].includes(f.name)
                      )
                      .map((def) => (
                        <div key={def.id} className="grid grid-cols-12 gap-2 items-center text-xs">
                          <span className="col-span-5 text-slate-400 font-medium truncate" title={def.name}>
                            {def.name}
                          </span>
                          <div className="col-span-7">
                            {def.fieldType === "SELECT" ? (
                              <select
                                value={(dealCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setDealCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                              >
                                <option value="">...</option>
                                {(def.options || []).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : def.fieldType === "DATE" ? (
                              <input
                                type="date"
                                value={(dealCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setDealCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                              />
                            ) : def.fieldType === "NUMBER" ? (
                              <input
                                type="number"
                                placeholder="..."
                                value={(dealCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setDealCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                              />
                            ) : (
                              <input
                                type="text"
                                placeholder="..."
                                value={(dealCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setDealCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                              />
                            )}
                          </div>
                        </div>
                      ))}

                    {/* Quick switch to field settings */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setLeftTab("settings")}
                        className="text-xs text-[#2e70e9] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Настроить / добавить поля сделки</span>
                      </button>
                    </div>
                  </div>

                  {/* ====== SECTION 2: AMO CONTACT CARD ====== */}
                  <div className="pt-4 border-t border-[#1b324d] space-y-3">
                    {/* Contact Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#203a54] text-[#60a5fa] font-bold text-xs flex items-center justify-center border border-[#2e70e9]/40">
                          {contactName ? contactName.charAt(0).toUpperCase() : "К"}
                        </div>
                        <input
                          type="text"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="Имя контакта"
                          className="bg-transparent font-bold text-sm text-white hover:bg-[#162838] focus:bg-[#162838] px-1.5 py-0.5 rounded border border-transparent focus:border-[#2e70e9] focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/contacts?contactId=${deal.contactId}`}
                          title="Открыть в разделе Контакты"
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#162838] transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>

                    {/* Компания */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Компания</span>
                      <div className="col-span-7">
                        <input
                          type="text"
                          placeholder="..."
                          value={contactCompany}
                          onChange={(e) => setContactCompany(e.target.value)}
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Раб. тел. */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Раб. тел.</span>
                      <div className="col-span-7 flex items-center gap-1.5">
                        {contactPhone && (
                          <>
                            {/* Call button */}
                            <a
                              href={`tel:${contactPhone.replace(/\s+/g, "")}`}
                              title="Позвонить контакту"
                              className="p-1.5 rounded bg-blue-950/80 border border-blue-800/60 text-blue-400 hover:bg-blue-900 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>

                            {/* WhatsApp open button */}
                            <button
                              type="button"
                              onClick={() => {
                                setRightView("whatsapp");
                                setMobileActiveTab("right");
                              }}
                              title="Открыть диалог в WhatsApp"
                              className="p-1.5 rounded bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/80 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <input
                          type="text"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="+7..."
                          className="flex-1 min-w-0 bg-[#162838] border border-[#223c56] text-blue-400 font-medium text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Email раб. */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Email раб.</span>
                      <div className="col-span-7">
                        <input
                          type="email"
                          placeholder="..."
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Должность */}
                    <div className="grid grid-cols-12 gap-2 items-center text-xs">
                      <span className="col-span-5 text-slate-400 font-medium">Должность</span>
                      <div className="col-span-7">
                        <input
                          type="text"
                          placeholder="..."
                          value={(contactCustomFields["Должность"] as string) || ""}
                          onChange={(e) =>
                            setContactCustomFields((prev) => ({
                              ...prev,
                              Должность: e.target.value,
                            }))
                          }
                          className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Дополнительные кастомные поля контакта */}
                    {customContactDefs
                      .filter((f) => !["Должность", "Имя контакта", "Телефон", "Email"].includes(f.name))
                      .map((def) => (
                        <div key={def.id} className="grid grid-cols-12 gap-2 items-center text-xs">
                          <span className="col-span-5 text-slate-400 font-medium truncate" title={def.name}>
                            {def.name}
                          </span>
                          <div className="col-span-7">
                            {def.fieldType === "SELECT" ? (
                              <select
                                value={(contactCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setContactCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                              >
                                <option value="">...</option>
                                {(def.options || []).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : def.fieldType === "DATE" ? (
                              <input
                                type="date"
                                value={(contactCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setContactCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none cursor-pointer"
                              />
                            ) : def.fieldType === "NUMBER" ? (
                              <input
                                type="number"
                                placeholder="..."
                                value={(contactCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setContactCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                              />
                            ) : (
                              <input
                                type="text"
                                placeholder="..."
                                value={(contactCustomFields[def.name] as string) || ""}
                                onChange={(e) =>
                                  setContactCustomFields((prev) => ({
                                    ...prev,
                                    [def.name]: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#162838] border border-[#223c56] text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                              />
                            )}
                          </div>
                        </div>
                      ))}

                    {/* Quick switch to contact field settings */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setLeftTab("settings")}
                        className="text-xs text-[#2e70e9] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Настроить / добавить поля контакта</span>
                      </button>
                    </div>

                    {/* Quick Add buttons */}
                    <div className="pt-2 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => alert("Контакт уже прикреплен к сделке")}
                        className="text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Добавить контакт</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const comp = prompt("Введите название компании:", contactCompany);
                          if (comp !== null) setContactCompany(comp);
                        }}
                        className="text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Добавить компанию</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ====== TAB: СТАТИСТИКА ====== */}
              {leftTab === "stats" && (
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-[#162838] rounded-xl border border-[#223c56] space-y-2">
                    <span className="font-bold text-white text-xs block">Финансовая статистика</span>
                    <div className="flex justify-between py-1 border-b border-[#223c56]/60">
                      <span className="text-slate-400">Бюджет:</span>
                      <span className="font-bold text-white">{formatCurrency(budgetNum, currency)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#223c56]/60">
                      <span className="text-slate-400">Оплачено:</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(totalPaid, currency)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Остаток:</span>
                      <span className="font-bold text-amber-400">{formatCurrency(remainingBudget, currency)}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-[#162838] rounded-xl border border-[#223c56] space-y-2">
                    <span className="font-bold text-white text-xs block">Даты и события</span>
                    <div className="flex justify-between py-1 border-b border-[#223c56]/60">
                      <span className="text-slate-400">Создана:</span>
                      <span className="text-slate-200">{formatDate(deal.createdAt)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#223c56]/60">
                      <span className="text-slate-400">Задач всего:</span>
                      <span className="text-slate-200">{deal.tasks.length}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Траншей оплат:</span>
                      <span className="text-slate-200">{deal.payments.length}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ====== TAB: ФАЙЛЫ ====== */}
              {leftTab === "files" && (
                <div className="p-6 text-center text-slate-400 text-xs space-y-3 bg-[#162838] rounded-xl border border-[#223c56]">
                  <AttachmentIcon className="w-8 h-8 mx-auto text-slate-500" />
                  <p>В этой сделке пока нет прикрепленных файлов.</p>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#203a54] hover:bg-[#2b4c6e] text-white rounded cursor-pointer font-medium">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Загрузить файл</span>
                    <input type="file" className="hidden" onChange={() => alert("Файл выбран для сделки")} />
                  </label>
                </div>
              )}
            </div>

            {/* ====== BOTTOM SAVE BAR ====== */}
            <div className="px-5 py-3 border-t border-[#1b324d] bg-[#122232] flex items-center justify-between shrink-0">
              {leftTab === "settings" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setLeftTab("general")}
                    className="px-5 py-2 bg-[#2e70e9] hover:bg-[#2358b8] text-white font-semibold text-xs rounded transition-colors shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Готово</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLeftTab("general")}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Вернуться к полям
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSaveFull}
                    disabled={isSaving}
                    className="px-5 py-2 bg-[#2e70e9] hover:bg-[#2358b8] text-white font-semibold text-xs rounded transition-colors shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSaving ? "Сохранение..." : "Сохранить"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ================= RIGHT COLUMN (7/12): AmoCRM Feed & Composer OR WhatsApp ================= */}
          <div
            className={cn(
              "md:col-span-7 flex-col h-full min-h-0 overflow-hidden bg-[#0a1520]",
              mobileActiveTab === "right" ? "flex" : "hidden md:flex"
            )}
          >
            {/* Top Toolbar on Right Column */}
            <div className="h-12 px-3 sm:px-5 bg-[#0d1b2a] border-b border-[#1b324d] flex items-center justify-between shrink-0">
              {/* Search & Filter */}
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Поиск и фильтр"
                  value={feedSearch}
                  onChange={(e) => setFeedSearch(e.target.value)}
                  className="w-full bg-[#162838] border border-[#223c56] text-xs text-slate-200 pl-8 pr-3 py-1 rounded focus:border-[#2e70e9] focus:outline-none placeholder-slate-500"
                />
              </div>

              {/* View Switcher: Feed vs WhatsApp */}
              <div className="flex items-center gap-1 bg-[#162838] p-0.5 rounded border border-[#223c56]">
                <button
                  type="button"
                  onClick={() => setRightView("feed")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    rightView === "feed"
                      ? "bg-[#2e70e9] text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Лента ({timelineItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightView("whatsapp")}
                  className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    rightView === "whatsapp"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            {rightView === "whatsapp" ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2 sm:p-3 bg-[#0c1926]">
                <EmbeddedWhatsappChat
                  dealId={deal.id}
                  contactId={deal.contactId}
                  contactPhone={contactPhone || deal.contact?.phone || ""}
                  contactName={contactName || deal.contact?.name || deal.title}
                />
              </div>
            ) : (
              <>
                {/* Scrollable AmoCRM Activity Feed */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Date separator: Сегодня */}
                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-[#1b324d] w-full" />
                    <span className="bg-[#162838] border border-[#223c56] text-[11px] font-semibold text-slate-400 px-3 py-0.5 rounded-full absolute">
                      События сделки
                    </span>
                  </div>

                  {timelineItems.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      Нет событий или примечаний по этой сделке
                    </div>
                  ) : (
                    timelineItems.map((item) => {
                      if (item.type === "audit") {
                        return (
                          <div
                            key={item.id}
                            className="text-xs text-slate-400 bg-[#122232]/80 border border-[#1b324d] rounded-lg p-2.5 flex items-start gap-2"
                          >
                            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span className="font-semibold text-slate-300">
                                {formatDate(item.date)}:
                              </span>{" "}
                              <span>{item.content}</span>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === "note") {
                        return (
                          <div
                            key={item.id}
                            className="bg-[#162838] border border-[#223c56] rounded-xl p-3.5 space-y-1.5 shadow-xs"
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <div className="flex items-center gap-1.5 font-semibold text-blue-400">
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>{item.authorName}</span>
                              </div>
                              <span>{formatDate(item.date)}</span>
                            </div>
                            <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                              {item.content}
                            </p>
                          </div>
                        );
                      }

                      if (item.type === "task") {
                        const task = item.meta as TaskItem;
                        return (
                          <div
                            key={item.id}
                            className={`border rounded-xl p-3.5 space-y-2 transition-all ${
                              task.isCompleted
                                ? "bg-[#112338]/50 border-emerald-900/40 opacity-75"
                                : "bg-[#162838] border-[#223c56]"
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (task.isCompleted) return;
                                    setCompletingTaskId(task.id);
                                  }}
                                  className="text-slate-400 hover:text-emerald-400 cursor-pointer"
                                >
                                  {task.isCompleted ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <Square className="w-4 h-4" />
                                  )}
                                </button>
                                <span
                                  className={`font-semibold ${
                                    task.isCompleted ? "line-through text-slate-500" : "text-white"
                                  }`}
                                >
                                  {task.title}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setEditingTask({
                                    id: task.id,
                                    title: task.title,
                                    description: task.description,
                                    dueDate: task.dueDate,
                                    taskType: task.taskType,
                                    assignedToId: task.assignedTo?.id,
                                    assignedTo: task.assignedTo,
                                    deal: {
                                      id: deal.id,
                                      title: deal.title,
                                      contact: deal.contact ? { phone: deal.contact.phone } : null,
                                    },
                                    contact: deal.contact
                                      ? {
                                          id: deal.contact.id,
                                          name: deal.contact.name,
                                          phone: deal.contact.phone,
                                          company: deal.contact.company,
                                        }
                                      : null,
                                  })
                                }
                                className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#203a54] hover:bg-[#2a4d70] text-blue-300 flex items-center gap-1 cursor-pointer transition-colors border border-blue-400/20"
                                title="Нажмите для редактирования параметров задачи"
                              >
                                <Settings className="w-2.5 h-2.5 text-blue-300" />
                                <span>{task.taskType}</span>
                              </button>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                <span>{task.assignedTo?.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>Срок: {formatDate(task.dueDate)}</span>
                              </div>
                            </div>

                            {/* Task complete prompt */}
                            {completingTaskId === task.id && (
                              <div className="pt-2 border-t border-[#223c56] space-y-2 animate-in fade-in">
                                <input
                                  type="text"
                                  placeholder="Результат выполнения задачи..."
                                  value={completionComment}
                                  onChange={(e) => setCompletionComment(e.target.value)}
                                  className="w-full bg-[#0c1926] border border-[#223c56] text-xs text-white p-2 rounded focus:outline-none"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setCompletingTaskId(null)}
                                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCompleteTask(task.id)}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                                  >
                                    Завершить задачу
                                  </button>
                                </div>
                              </div>
                            )}

                            {task.resultComment && (
                              <div className="text-[11px] text-emerald-400/90 bg-emerald-950/30 p-2 rounded border border-emerald-900/40">
                                Результат: {task.resultComment}
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (item.type === "payment") {
                        const payment = item.meta as PaymentItem;
                        return (
                          <div
                            key={item.id}
                            className="bg-[#162838] border border-emerald-800/40 rounded-xl p-3.5 space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-emerald-400 flex items-center gap-1">
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>{formatCurrency(payment.amount, payment.currency)}</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {formatDate(payment.paymentDate)}
                                </span>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePayment(payment.id)}
                                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {payment.comment && (
                              <p className="text-xs text-slate-300">{payment.comment}</p>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })
                  )}
                </div>

                {/* ====== DOCKED AMO COMPOSER ====== */}
                <div className="p-4 bg-[#0d1b2a] border-t border-[#1b324d] shrink-0 space-y-3">
                  {/* Composer Mode Selector: Примечание | Задача | Оплата | WhatsApp */}
                  <div className="flex items-center gap-2 border-b border-[#1b324d] pb-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setComposerMode("note")}
                      className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                        composerMode === "note"
                          ? "bg-[#203a54] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Примечание
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerMode("task")}
                      className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                        composerMode === "task"
                          ? "bg-[#203a54] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Задача
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerMode("payment")}
                      className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                        composerMode === "payment"
                          ? "bg-[#203a54] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Оплата
                    </button>
                    <button
                      type="button"
                      onClick={() => setRightView("whatsapp")}
                      className="px-3 py-1 rounded font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer ml-auto"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>В чат WhatsApp</span>
                    </button>
                  </div>

                  {/* 1. Note Composer */}
                  {composerMode === "note" && (
                    <form onSubmit={handleAddNote} className="space-y-2">
                      <textarea
                        rows={3}
                        required
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder="Примечание: введите текст..."
                        className="w-full bg-[#162838] border border-[#223c56] text-xs text-white rounded p-3 focus:border-[#2e70e9] focus:outline-none resize-none placeholder-slate-500"
                      />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={isNoteSubmitting || !newNoteContent.trim()}
                            className="px-4 py-1.5 bg-[#2e70e9] hover:bg-[#2358b8] text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {isNoteSubmitting ? "Добавление..." : "Добавить"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewNoteContent("")}
                            className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            Отменить
                          </button>
                        </div>

                        <label className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#162838] transition-colors cursor-pointer">
                          <Paperclip className="w-4 h-4" />
                          <input
                            type="file"
                            className="hidden"
                            onChange={() => alert("Прикрепление файлов будет добавлено")}
                          />
                        </label>
                      </div>
                    </form>
                  )}

                  {/* 2. Task Composer */}
                  {composerMode === "task" && (
                    <form onSubmit={handleCreateTask} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          placeholder="Что нужно сделать?"
                          className="bg-[#162838] border border-[#223c56] text-xs text-white rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        />
                        <input
                          type="datetime-local"
                          required
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="bg-[#162838] border border-[#223c56] text-xs text-white rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={taskType}
                          onChange={(e) => setTaskType(e.target.value)}
                          className="bg-[#162838] border border-[#223c56] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        >
                          <option value="CALL">Звонок</option>
                          <option value="MEETING">Встреча</option>
                          <option value="MESSAGE">Написать в WhatsApp</option>
                          <option value="TASK">Задача</option>
                        </select>

                        <select
                          value={taskAssignedId}
                          onChange={(e) => setTaskAssignedId(e.target.value)}
                          className="bg-[#162838] border border-[#223c56] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        >
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setComposerMode("note")}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Отмена
                        </button>
                        <button
                          type="submit"
                          disabled={isTaskSubmitting || !taskTitle.trim() || !taskDueDate}
                          className="px-4 py-1.5 bg-[#2e70e9] hover:bg-[#2358b8] text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors"
                        >
                          {isTaskSubmitting ? "Создание..." : "Поставить задачу"}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 3. Payment Composer */}
                  {composerMode === "payment" && (
                    <form onSubmit={handleAddPayment} className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          required
                          min="1"
                          step="any"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="Сумма оплаты"
                          className="bg-[#162838] border border-[#223c56] text-xs text-white rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none font-bold"
                        />
                        <select
                          value={paymentCurrency}
                          onChange={(e) => setPaymentCurrency(e.target.value as Currency)}
                          className="bg-[#162838] border border-[#223c56] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                        >
                          <option value="KZT">KZT (₸)</option>
                          <option value="USD">USD ($)</option>
                          <option value="RUB">RUB (₽)</option>
                        </select>
                      </div>

                      <input
                        type="text"
                        value={paymentComment}
                        onChange={(e) => setPaymentComment(e.target.value)}
                        placeholder="Комментарий (1-й транш, аванс...)"
                        className="w-full bg-[#162838] border border-[#223c56] text-xs text-white rounded px-2.5 py-1.5 focus:border-[#2e70e9] focus:outline-none"
                      />

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setComposerMode("note")}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Отмена
                        </button>
                        <button
                          type="submit"
                          disabled={isPaymentSubmitting || !paymentAmount}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors"
                        >
                          {isPaymentSubmitting ? "Внесение..." : "Внести оплату"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ================= DEAL FIELD SETTINGS MODAL (amoCRM Modal) ================= */}
      <DealFieldSettingsModal
        isOpen={isFieldSettingsOpen}
        onClose={() => setIsFieldSettingsOpen(false)}
        dealFields={customDealDefs}
        contactFields={customContactDefs}
        isAdmin={isAdmin}
        onFieldsChanged={reloadFieldDefs}
      />

      {/* ================= EDIT TASK MODAL ================= */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={onDealUpdated}
          users={users}
        />
      )}
    </div>
  );
}
