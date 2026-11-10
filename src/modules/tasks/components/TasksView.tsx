"use client";

import { useState, useMemo } from "react";
import { createTask, completeTask, deleteTask } from "../actions";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Phone,
  Briefcase,
  User,
  Trash2,
  X,
  Filter,
} from "lucide-react";

interface TaskItemData {
  id: string;
  title: string;
  description?: string | null;
  taskType: string;
  dueDate: Date | string;
  isCompleted: boolean;
  completedAt?: Date | string | null;
  resultComment?: string | null;
  deal?: {
    id: string;
    title: string;
  } | null;
  contact?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  assignedTo: {
    id: string;
    name: string;
  };
}

interface TasksViewProps {
  tasks: TaskItemData[];
  isAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
  deals: { id: string; title: string; contactId: string }[];
  contacts: { id: string; name: string }[];
}

type TaskFilterType = "ACTIVE" | "TODAY" | "OVERDUE" | "UPCOMING" | "COMPLETED";

export function TasksView({
  tasks,
  isAdmin,
  currentUserId,
  users,
  deals,
  contacts,
}: TasksViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<TaskFilterType>("ACTIVE");

  // Create task modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("CALL");
  const [dueDate, setDueDate] = useState("");
  const [dealId, setDealId] = useState("");
  const [contactId, setContactId] = useState("");
  const [assignedToId, setAssignedToId] = useState(currentUserId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Complete dialog state
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [resultComment, setResultComment] = useState("");

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Compute metrics
  const activeTasks = tasks.filter((t) => !t.isCompleted);
  const overdueTasks = activeTasks.filter((t) => new Date(t.dueDate) < now);
  const todayTasks = activeTasks.filter(
    (t) => new Date(t.dueDate).toISOString().slice(0, 10) === todayStr
  );
  const upcomingTasks = activeTasks.filter(
    (t) =>
      new Date(t.dueDate) > now &&
      new Date(t.dueDate).toISOString().slice(0, 10) !== todayStr
  );
  const completedTasks = tasks.filter((t) => t.isCompleted);

  // Filtered list
  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "TODAY":
        return todayTasks;
      case "OVERDUE":
        return overdueTasks;
      case "UPCOMING":
        return upcomingTasks;
      case "COMPLETED":
        return completedTasks;
      case "ACTIVE":
      default:
        return activeTasks;
    }
  }, [filter, tasks, activeTasks, overdueTasks, todayTasks, upcomingTasks, completedTasks]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;

    setIsSubmitting(true);
    setError(null);

    const res = await createTask({
      title: title.trim(),
      description: description.trim() || undefined,
      taskType,
      dueDate,
      dealId: dealId || undefined,
      contactId: contactId || undefined,
      assignedToId,
    });

    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error || "Ошибка создания задачи");
    } else {
      setTitle("");
      setDescription("");
      setDueDate("");
      setDealId("");
      setContactId("");
      setIsCreateOpen(false);
      router.refresh();
    }
  };

  const handleCompleteSubmit = async (taskId: string) => {
    await completeTask(taskId, resultComment.trim() || undefined);
    setCompletingTaskId(null);
    setResultComment("");
    router.refresh();
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Удалить задачу?")) return;
    await deleteTask(taskId);
    router.refresh();
  };

  const getTaskTypeBadge = (type: string) => {
    switch (type) {
      case "CALL":
        return { label: "Звонок", color: "bg-blue-50 text-blue-700 border-blue-200" };
      case "MEETING":
        return { label: "Встреча", color: "bg-purple-50 text-purple-700 border-purple-200" };
      case "OFFER":
        return { label: "Отправить КП", color: "bg-amber-50 text-amber-700 border-amber-200" };
      case "PAYMENT":
        return { label: "Контроль оплаты", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      default:
        return { label: "Задача", color: "bg-slate-100 text-slate-700 border-slate-200" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Задачи и напоминания</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {activeTasks.length} активных
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdmin
                  ? "Все запланированные задачи сотрудников по звонкам, встречам и контролю оплат"
                  : "Ваши персональные задачи и дедлайны по сделкам"}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Поставить задачу</span>
        </button>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilter("ACTIVE")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filter === "ACTIVE"
              ? "bg-blue-50/70 border-blue-400 ring-2 ring-blue-400/20"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Все в работе
          </span>
          <div className="text-xl font-black text-slate-900 mt-0.5">
            {activeTasks.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("OVERDUE")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filter === "OVERDUE"
              ? "bg-rose-50/70 border-rose-400 ring-2 ring-rose-400/20"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
            Просрочено
          </span>
          <div className="text-xl font-black text-rose-600 mt-0.5">
            {overdueTasks.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("TODAY")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filter === "TODAY"
              ? "bg-amber-50/70 border-amber-400 ring-2 ring-amber-400/20"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
            На сегодня
          </span>
          <div className="text-xl font-black text-amber-600 mt-0.5">
            {todayTasks.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("COMPLETED")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            filter === "COMPLETED"
              ? "bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-400/20"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
            Выполнено
          </span>
          <div className="text-xl font-black text-emerald-600 mt-0.5">
            {completedTasks.length}
          </div>
        </button>
      </div>

      {/* Complete Task Result Dialog */}
      {completingTaskId && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-900 text-sm">
              Завершение задачи: добавьте комментарий с результатом
            </span>
            <button
              onClick={() => setCompletingTaskId(null)}
              className="text-amber-700 hover:text-amber-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            required
            value={resultComment}
            onChange={(e) => setResultComment(e.target.value)}
            placeholder="Например: Созвонились, клиент согласовал условия, готовим счет"
            className="w-full px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCompletingTaskId(null)}
              className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => handleCompleteSubmit(completingTaskId)}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer"
            >
              Подтвердить выполнение
            </button>
          </div>
        </div>
      )}

      {/* Tasks Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 w-10"></th>
                <th className="py-3 px-4">Задача и тип</th>
                <th className="py-3 px-4">Сделка / Контакт</th>
                <th className="py-3 px-4">Дедлайн</th>
                <th className="py-3 px-4">Ответственный</th>
                <th className="py-3 px-4">Статус</th>
                <th className="py-3 px-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Нет задач в выбранной категории
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const isOverdue =
                    !task.isCompleted && new Date(task.dueDate) < now;
                  const isToday =
                    !task.isCompleted &&
                    new Date(task.dueDate).toISOString().slice(0, 10) === todayStr;
                  const badge = getTaskTypeBadge(task.taskType);

                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        task.isCompleted ? "opacity-60 bg-slate-50/30" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={task.isCompleted}
                          disabled={task.isCompleted}
                          onChange={() => setCompletingTaskId(task.id)}
                          className="rounded text-blue-600 cursor-pointer w-4 h-4"
                        />
                      </td>

                      {/* Title & Type */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div
                            className={`font-bold text-slate-900 ${
                              task.isCompleted ? "line-through text-slate-400" : ""
                            }`}
                          >
                            {task.title}
                          </div>
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                          {task.resultComment && (
                            <p className="text-[11px] text-emerald-700 italic bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              Результат: {task.resultComment}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Deal / Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {task.deal ? (
                            <div className="font-semibold text-blue-600 flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-blue-500" />
                              <span>{task.deal.title}</span>
                            </div>
                          ) : null}
                          {task.contact ? (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{task.contact.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      {/* Due date */}
                      <td className="py-3.5 px-4 font-medium">
                        <div
                          className={`flex items-center gap-1.5 ${
                            isOverdue
                              ? "text-rose-600 font-bold"
                              : isToday
                              ? "text-amber-600 font-bold"
                              : "text-slate-700"
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{formatDate(task.dueDate)}</span>
                        </div>
                      </td>

                      {/* Responsible */}
                      <td className="py-3.5 px-4 text-slate-700">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                          {task.assignedTo.name}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            task.isCompleted
                              ? "bg-emerald-100 text-emerald-800"
                              : isOverdue
                              ? "bg-rose-100 text-rose-800"
                              : isToday
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {task.isCompleted
                            ? "Выполнено"
                            : isOverdue
                            ? "Просрочено"
                            : isToday
                            ? "На сегодня"
                            : "Запланировано"}
                        </span>
                      </td>

                      {/* Delete Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Удалить задачу"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Task Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Поставить новую задачу</h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-6 space-y-3.5">
              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Название задачи *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Позвонить и сверить реквизиты"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Тип задачи
                  </label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-medium"
                  >
                    <option value="CALL">Звонок</option>
                    <option value="MEETING">Встреча</option>
                    <option value="OFFER">Отправить КП</option>
                    <option value="PAYMENT">Контроль оплаты</option>
                    <option value="OTHER">Другое</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Срок / Дедлайн *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Привязать сделку
                  </label>
                  <select
                    value={dealId}
                    onChange={(e) => setDealId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="">-- Без сделки --</option>
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ответственный
                  </label>
                  <select
                    value={assignedToId}
                    onChange={(e) => setAssignedToId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Сохранение..." : "Поставить задачу"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
