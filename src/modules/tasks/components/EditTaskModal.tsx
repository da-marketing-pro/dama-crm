"use client";

import { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  User,
  Check,
  Trash2,
  ExternalLink,
  Phone,
  MessageSquare,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { updateTask, deleteTask } from "../actions";
import { getGoogleCalendarTemplateUrl } from "@/lib/calendarService";

export interface TaskEditableData {
  id: string;
  title: string;
  description?: string | null;
  taskType?: string | null;
  dueDate: Date | string;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  deal?: { id: string; title: string; contact?: { phone?: string | null } | null } | null;
  contact?: { id: string; name: string; phone?: string | null; company?: string | null } | null;
  isCompleted?: boolean;
}

interface EditTaskModalProps {
  task: TaskEditableData | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  users?: { id: string; name: string }[];
}

function toDateTimeLocalInputValue(dateInput: Date | string): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hours}:${mins}`;
}

export function EditTaskModal({
  task,
  isOpen,
  onClose,
  onSaved,
  users = [],
}: EditTaskModalProps) {
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("CALL");
  const [dueDateTime, setDueDateTime] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (task && isOpen) {
      setTitle(task.title || "");
      setTaskType(task.taskType || "CALL");
      setDueDateTime(task.dueDate ? toDateTimeLocalInputValue(task.dueDate) : "");
      setAssignedToId(task.assignedToId || task.assignedTo?.id || "");
      setDescription(task.description || "");
      setErrorMessage(null);
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDateTime) {
      setErrorMessage("Укажите название задачи и срок выполнения");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // В браузере пользователя переводим локально выбранное время в точный ISO формат
    const resolvedDueDate = dueDateTime.includes("Z") || dueDateTime.includes("+")
      ? dueDateTime
      : new Date(dueDateTime).toISOString();

    const res = await updateTask({
      taskId: task.id,
      title: title.trim(),
      taskType,
      dueDate: resolvedDueDate,
      assignedToId: assignedToId || undefined,
      description: description.trim() || undefined,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || "Ошибка сохранения задачи");
    } else {
      onClose();
      if (onSaved) onSaved();
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить задачу «${task.title}»?`)) return;
    setIsDeleting(true);
    const res = await deleteTask(task.id);
    setIsDeleting(false);
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка удаления");
    } else {
      onClose();
      if (onSaved) onSaved();
    }
  };

  const gCalUrl = getGoogleCalendarTemplateUrl({
    title,
    taskType,
    dueDate: dueDateTime || task.dueDate,
    description,
    dealTitle: task.deal?.title,
    dealId: task.deal?.id,
    contactName: task.contact?.name,
    contactPhone: task.contact?.phone || task.deal?.contact?.phone,
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Редактирование задачи</h3>
              <p className="text-[11px] text-slate-500">
                Изменение даты, времени, типа и ответственного
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Context: Deal / Contact */}
          {(task.deal || task.contact) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              {task.deal && (
                <div className="flex items-center gap-2 text-slate-700">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-800">Сделка:</span>
                  <span className="truncate">{task.deal.title}</span>
                </div>
              )}
              {task.contact && (
                <div className="flex items-center gap-2 text-slate-700">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-800">Клиент:</span>
                  <span>{task.contact.name}</span>
                  {task.contact.phone && (
                    <span className="text-[11px] font-mono text-slate-500">
                      ({task.contact.phone})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Название задачи *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что нужно сделать?"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
            />
          </div>

          {/* Type & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Тип задачи *
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium cursor-pointer"
              >
                <option value="CALL">📞 Звонок</option>
                <option value="MEETING">🤝 Встреча</option>
                <option value="MESSAGE">💬 Написать в WhatsApp</option>
                <option value="TASK">📋 Задача</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Срок выполнения (дата и время) *
              </label>
              <input
                type="datetime-local"
                required
                value={dueDateTime}
                onChange={(e) => setDueDateTime(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium cursor-pointer"
              />
            </div>
          </div>

          {/* Responsible Manager */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ответственный менеджер
            </label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium cursor-pointer"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Комментарий / Описание
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Дополнительные детали или тезисы к задаче..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 resize-none leading-relaxed"
            />
          </div>

          {/* Quick Google Calendar Link */}
          <div className="pt-2 flex items-center justify-between text-xs">
            <a
              href={gCalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-[11px] font-semibold"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>Добавить в Google Календарь (1 клик)</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={isDeleting || isSubmitting}
              onClick={handleDelete}
              className="px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !dueDateTime}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSubmitting ? "Сохранение..." : "Сохранить"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
