"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  createTask,
  completeTask,
  deleteTask,
  updateTaskDueDate,
  toggleTaskCompleted,
} from "../actions";
import { formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Square,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Phone,
  PhoneCall,
  Briefcase,
  User,
  Trash2,
  X,
  Filter,
  Search,
  Building2,
  Users,
  FileText,
  CreditCard,
  MessageCircle,
  Kanban,
  List,
  ExternalLink,
  ChevronDown,
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
    company?: string | null;
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

const WEEKDAY_NAMES_RU = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];

const MONTH_NAMES_RU = [
  "янв.",
  "февр.",
  "марта",
  "апр.",
  "мая",
  "июня",
  "июля",
  "авг.",
  "сент.",
  "окт.",
  "нояб.",
  "дек.",
];

function getLocalDateString(d: Date | string) {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTaskTimeSchedule(dueDate: Date | string, assignedName: string) {
  const date = new Date(dueDate);
  const today = new Date();
  const todayStr = getLocalDateString(today);
  const taskStr = getLocalDateString(date);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrow);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hasSpecificTime = !(hours === "00" && minutes === "00");
  const timeSuffix = hasSpecificTime ? ` ${hours}:${minutes}` : "";

  let dayLabel = "";
  if (taskStr === todayStr) {
    dayLabel = "Сегодня";
  } else if (taskStr === tomorrowStr) {
    dayLabel = "Завтра";
  } else if (taskStr === yesterdayStr) {
    dayLabel = "Вчера";
  } else {
    const day = date.getDate();
    const month = MONTH_NAMES_RU[date.getMonth()];
    dayLabel = `${day} ${month}`;
  }

  return `${dayLabel}${timeSuffix}, для ${assignedName}`;
}

function getTaskTypeInfo(taskType: string) {
  switch (taskType) {
    case "CALL":
      return {
        label: "Связаться",
        icon: PhoneCall,
        color: "text-blue-600",
        badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
      };
    case "MEETING":
      return {
        label: "Встреча",
        icon: Users,
        color: "text-purple-600",
        badgeBg: "bg-purple-50 text-purple-700 border-purple-200",
      };
    case "OFFER":
      return {
        label: "Отправить КП",
        icon: FileText,
        color: "text-amber-600",
        badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
      };
    case "PAYMENT":
      return {
        label: "Контроль оплаты",
        icon: CreditCard,
        color: "text-emerald-600",
        badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "MESSAGE":
      return {
        label: "Написать",
        icon: MessageCircle,
        color: "text-emerald-600",
        badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    default:
      return {
        label: "Задача",
        icon: CheckSquare,
        color: "text-slate-600",
        badgeBg: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

interface KanbanColumn {
  id: string;
  type: "day";
  date: Date;
  dateStr: string;
  title: string;
  subtitle: string;
  indicatorColor: string;
  badgeColor: string;
}

export function TasksView({
  tasks,
  isAdmin,
  currentUserId,
  users,
  deals,
  contacts,
}: TasksViewProps) {
  const router = useRouter();

  // View mode: Kanban (default) vs List
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("ALL");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "COMPLETED" | "OVERDUE">("ALL");

  // Create Task Modal state
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

  // Complete Task Dialog state
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [resultComment, setResultComment] = useState("");

  // Drag and Drop State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const now = new Date();
  const todayStr = getLocalDateString(now);

  // Global KPIs
  const activeTasks = tasks.filter((t) => !t.isCompleted);
  const overdueTasks = activeTasks.filter(
    (t) => getLocalDateString(t.dueDate) < todayStr
  );
  const todayTasks = activeTasks.filter(
    (t) => getLocalDateString(t.dueDate) === todayStr
  );
  const completedTasks = tasks.filter((t) => t.isCompleted);

  // Filter tasks based on search & selectors
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // User filter
      if (selectedUserFilter === "MY" && t.assignedTo.id !== currentUserId) return false;
      if (selectedUserFilter !== "ALL" && selectedUserFilter !== "MY" && t.assignedTo.id !== selectedUserFilter) {
        return false;
      }

      // Type filter
      if (selectedTypeFilter !== "ALL" && t.taskType !== selectedTypeFilter) return false;

      // Status filter
      if (statusFilter === "ACTIVE" && t.isCompleted) return false;
      if (statusFilter === "COMPLETED" && !t.isCompleted) return false;
      if (statusFilter === "OVERDUE" && (t.isCompleted || getLocalDateString(t.dueDate) >= todayStr)) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDeal = t.deal?.title.toLowerCase().includes(q);
        const matchesContact = t.contact?.name.toLowerCase().includes(q);
        const matchesCompany = t.contact?.company?.toLowerCase().includes(q);
        const matchesUser = t.assignedTo.name.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDeal && !matchesContact && !matchesCompany && !matchesUser) {
          return false;
        }
      }

      return true;
    });
  }, [tasks, selectedUserFilter, selectedTypeFilter, statusFilter, searchQuery, currentUserId, todayStr]);

  // Dynamic Work Week Kanban Columns:
  // Starts with "ЗАДАЧИ НА СЕГОДНЯ", then next days of the work cycle (Monday-Saturday).
  // Automatically moves forward by 1 day every single day!
  const kanbanColumns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cols: KanbanColumn[] = [];

    // 1. Column for today
    const todayDayName = WEEKDAY_NAMES_RU[today.getDay()];
    cols.push({
      id: "today",
      type: "day" as const,
      date: new Date(today),
      dateStr: todayStr,
      title: "ЗАДАЧИ НА СЕГОДНЯ",
      subtitle: `${todayDayName}, ${today.getDate()} ${MONTH_NAMES_RU[today.getMonth()]}`,
      indicatorColor: "border-b-2 border-emerald-500",
      badgeColor: "bg-emerald-50 text-emerald-700",
    });

    // Next 5 working days (skipping Sundays because the week ends on Saturday and starts on Monday)
    let cursor = new Date(today);
    while (cols.length < 6) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      if (cursor.getDay() === 0) {
        // Skip Sunday
        continue;
      }
      const dayName = WEEKDAY_NAMES_RU[cursor.getDay()];
      const isTomorrow = cols.length === 1;
      const dateStr = getLocalDateString(cursor);

      cols.push({
        id: `day-${dateStr}`,
        type: "day" as const,
        date: new Date(cursor),
        dateStr,
        title: isTomorrow ? `ЗАДАЧИ НА ЗАВТРА` : dayName.toUpperCase(),
        subtitle: `${cursor.getDate()} ${MONTH_NAMES_RU[cursor.getMonth()]}${isTomorrow ? ` (${dayName})` : ""}`,
        indicatorColor: isTomorrow ? "border-b-2 border-blue-500" : "border-b-2 border-sky-400",
        badgeColor: "bg-blue-50 text-blue-700",
      });
    }

    return cols;
  }, [todayStr]);

  // Group filtered tasks by Kanban columns
  const kanbanGrouped = useMemo(() => {
    const overdueList: TaskItemData[] = [];
    const dayMap = new Map<string, TaskItemData[]>();
    kanbanColumns.forEach((c) => dayMap.set(c.dateStr, []));
    const laterList: TaskItemData[] = [];
    const completedList: TaskItemData[] = [];

    const lastColumnDateStr = kanbanColumns[kanbanColumns.length - 1]?.dateStr || "";

    filteredTasks.forEach((task) => {
      if (task.isCompleted) {
        completedList.push(task);
        return;
      }

      const taskDateStr = getLocalDateString(task.dueDate);

      if (taskDateStr < todayStr) {
        overdueList.push(task);
      } else if (dayMap.has(taskDateStr)) {
        dayMap.get(taskDateStr)!.push(task);
      } else if (taskDateStr > lastColumnDateStr) {
        laterList.push(task);
      } else {
        // If Sunday or between, bucket into the next Monday or Later
        laterList.push(task);
      }
    });

    return {
      overdue: overdueList,
      days: dayMap,
      later: laterList,
      completed: completedList,
    };
  }, [filteredTasks, kanbanColumns, todayStr]);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (dragOverColumnId !== colId) {
      setDragOverColumnId(colId);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetColId: string, targetDateStr?: string) => {
    e.preventDefault();
    setDragOverColumnId(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    if (!taskId) return;

    if (targetColId === "completed") {
      // Mark completed
      await completeTask(taskId, "Выполнено через канбан задач");
      router.refresh();
      return;
    }

    if (targetDateStr) {
      // Find original task to preserve its hour/minute
      const original = tasks.find((t) => t.id === taskId);
      const originalDate = original ? new Date(original.dueDate) : new Date();
      const hours = originalDate.getHours();
      const minutes = originalDate.getMinutes();

      const [y, m, d] = targetDateStr.split("-").map(Number);
      const newDate = new Date(y, m - 1, d, hours || 12, minutes || 0, 0);

      // If task was completed, reopen it
      if (original?.isCompleted) {
        await toggleTaskCompleted(taskId, false);
      }
      await updateTaskDueDate(taskId, newDate);
      router.refresh();
      return;
    }

    if (targetColId === "later") {
      // Set to 7 days from now
      const laterDate = new Date();
      laterDate.setDate(laterDate.getDate() + 7);
      await updateTaskDueDate(taskId, laterDate);
      router.refresh();
    }
  };

  // Quick Create Task modal opener with specific day
  const handleOpenCreateForDate = (dateStr?: string) => {
    if (dateStr) {
      setDueDate(`${dateStr}T12:00`);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDueDate(`${getLocalDateString(tomorrow)}T12:00`);
    }
    setIsCreateOpen(true);
  };

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

  // Task Card Component matching amoCRM Screenshot layout
  const renderTaskCard = (task: TaskItemData) => {
    const isOverdue = !task.isCompleted && getLocalDateString(task.dueDate) < todayStr;
    const isToday = !task.isCompleted && getLocalDateString(task.dueDate) === todayStr;
    const typeInfo = getTaskTypeInfo(task.taskType);
    const TypeIcon = typeInfo.icon;

    // Line 1: Contact name + Company
    const contactText = task.contact?.name
      ? `${task.contact.name}${task.contact.company ? `, ${task.contact.company}` : ""}`
      : "Без привязки к контакту";

    // Line 2: Deal Title
    const dealTitle = task.deal?.title || "Без привязки к сделке";

    // Line 3: Schedule + Manager
    const scheduleText = formatTaskTimeSchedule(task.dueDate, task.assignedTo.name);

    return (
      <div
        key={task.id}
        draggable={true}
        onDragStart={(e) => handleDragStart(e, task.id)}
        className={`group relative bg-white border rounded-xl p-3 shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none ${
          task.isCompleted
            ? "border-slate-200 bg-slate-50/70 opacity-65"
            : isOverdue
            ? "border-slate-200 border-l-4 border-l-rose-500 hover:border-rose-400"
            : isToday
            ? "border-slate-200 border-l-4 border-l-emerald-500 hover:border-emerald-400"
            : "border-slate-200 hover:border-blue-400"
        }`}
      >
        {/* Top actions & checkbox */}
        <div className="flex items-start justify-between gap-1.5 mb-1.5">
          {/* Line 1: Contact & Company */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 truncate flex-1 min-w-0">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            {task.contact ? (
              <Link
                href={`/contacts?contactId=${task.contact.id}`}
                className="hover:text-blue-600 truncate"
                title={contactText}
              >
                {contactText}
              </Link>
            ) : (
              <span className="text-slate-400 truncate">{contactText}</span>
            )}
          </div>

          {/* Quick complete checkbox / checkmark */}
          <button
            type="button"
            onClick={() => {
              if (task.isCompleted) {
                toggleTaskCompleted(task.id, false);
                router.refresh();
              } else {
                setCompletingTaskId(task.id);
              }
            }}
            title={task.isCompleted ? "Снять отметку о выполнении" : "Завершить задачу"}
            className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer shrink-0"
          >
            {task.isCompleted ? (
              <CheckSquare className="w-4 h-4 text-emerald-600" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Line 2: Deal Title (Bold Blue Link) */}
        <div className="mb-1.5">
          {task.deal ? (
            <Link
              href="/deals"
              className="text-xs font-bold text-blue-600 hover:text-blue-800 line-clamp-1 flex items-center gap-1"
              title={dealTitle}
            >
              <span>{dealTitle}</span>
            </Link>
          ) : (
            <span className="text-xs font-semibold text-slate-400 italic">
              {dealTitle}
            </span>
          )}
        </div>

        {/* Line 3: Schedule & Responsible Manager */}
        <div
          className={`flex items-center gap-1 text-[11px] font-medium mb-2 ${
            task.isCompleted
              ? "text-slate-400"
              : isOverdue
              ? "text-rose-600 font-semibold"
              : isToday
              ? "text-emerald-700 font-semibold"
              : "text-slate-600"
          }`}
        >
          <Clock className="w-3 h-3 shrink-0 opacity-70" />
          <span className="truncate">{scheduleText}</span>
        </div>

        {/* Line 4: Action Type & Title */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 min-w-0">
            <TypeIcon className={`w-3.5 h-3.5 ${typeInfo.color} shrink-0`} />
            <span
              className={`truncate ${
                task.isCompleted ? "line-through text-slate-400" : ""
              }`}
              title={task.title}
            >
              <span className="font-bold">{typeInfo.label}:</span> {task.title}
            </span>
          </div>

          {/* Delete Action on hover */}
          <button
            type="button"
            onClick={() => handleDeleteTask(task.id)}
            title="Удалить задачу"
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity p-0.5 cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Result comment if present */}
        {task.resultComment && (
          <div className="mt-2 text-[10px] text-emerald-800 bg-emerald-50/80 border border-emerald-200/60 p-1.5 rounded-md leading-tight">
            ✓ {task.resultComment}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 select-none">
      {/* ================= PAGE HEADER ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Задачи и напоминания</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {activeTasks.length} активных
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Канбан-расписание рабочих дней недели и контроль выполнения договоренностей
              </p>
            </div>
          </div>
        </div>

        {/* Right controls: View toggle & Add button */}
        <div className="flex items-center gap-2">
          {/* Switch: Kanban vs List */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Канбан</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Список</span>
            </button>
          </div>

          <button
            onClick={() => handleOpenCreateForDate()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Добавить задачу</span>
          </button>
        </div>
      </div>

      {/* ================= KPI COUNTERS & QUICK FILTERS ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter("ACTIVE")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "ACTIVE"
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
          onClick={() => setStatusFilter("OVERDUE")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "OVERDUE"
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
          onClick={() => setStatusFilter("ALL")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "ALL"
              ? "bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-400/20"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
            На сегодня
          </span>
          <div className="text-xl font-black text-emerald-600 mt-0.5">
            {todayTasks.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("COMPLETED")}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === "COMPLETED"
              ? "bg-slate-100/70 border-slate-400 ring-2 ring-slate-400/20"
              : "bg-white border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Выполнено
          </span>
          <div className="text-xl font-black text-slate-700 mt-0.5">
            {completedTasks.length}
          </div>
        </button>
      </div>

      {/* ================= SEARCH & TOOLBAR ================= */}
      <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Поиск по задачам, контактам, компании..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Manager Filter */}
        <div className="flex items-center gap-2">
          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Все менеджеры</option>
            <option value="MY">Мои задачи</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Все типы задач</option>
            <option value="CALL">Звонки</option>
            <option value="MEETING">Встречи</option>
            <option value="OFFER">Отправить КП</option>
            <option value="PAYMENT">Контроль оплаты</option>
            <option value="MESSAGE">WhatsApp</option>
            <option value="OTHER">Другое</option>
          </select>
        </div>
      </div>

      {/* ================= COMPLETE TASK RESULT DIALOG ================= */}
      {completingTaskId && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-900 text-sm">
              Завершение задачи: добавьте комментарий с результатом
            </span>
            <button
              onClick={() => setCompletingTaskId(null)}
              className="text-amber-700 hover:text-amber-900 cursor-pointer"
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
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer"
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

      {/* ================= VIEW 1: TASKS KANBAN ================= */}
      {viewMode === "kanban" ? (
        <div className="w-full min-w-0 max-w-full overflow-x-auto pb-4 pt-1 kanban-scroll-area">
          <div className="flex gap-4 items-start w-max min-w-full pb-2">
            {/* COLUMN: ПРОСРОЧЕННЫЕ (shown if any exist or selected) */}
            {kanbanGrouped.overdue.length > 0 && (
              <div
                onDragOver={(e) => handleDragOver(e, "overdue")}
                className={`w-[290px] shrink-0 bg-rose-50/40 border rounded-2xl p-3 flex flex-col transition-colors ${
                  dragOverColumnId === "overdue"
                    ? "border-rose-400 ring-2 ring-rose-400/20 bg-rose-50/80"
                    : "border-rose-200"
                }`}
              >
                {/* Column Header */}
                <div className="pb-2.5 mb-2.5 border-b-2 border-rose-500">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-rose-700">
                      ПРОСРОЧЕННЫЕ
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                      {kanbanGrouped.overdue.length}
                    </span>
                  </div>
                  <div className="text-[11px] text-rose-600 font-medium mt-0.5">
                    Срок выполнения истек
                  </div>
                </div>

                {/* Cards Container */}
                <div className="space-y-2.5 min-h-[120px]">
                  {kanbanGrouped.overdue.map(renderTaskCard)}
                </div>
              </div>
            )}

            {/* COLUMNS: ДНИ РАБОЧЕЙ НЕДЕЛИ (starting with Сегодня) */}
            {kanbanColumns.map((col) => {
              const colTasks = kanbanGrouped.days.get(col.dateStr) || [];
              const isToday = col.id === "today";
              const isHovered = dragOverColumnId === col.id;

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDrop={(e) => handleDrop(e, col.id, col.dateStr)}
                  className={`w-[290px] shrink-0 border rounded-2xl p-3 flex flex-col transition-colors ${
                    isHovered
                      ? "border-blue-400 ring-2 ring-blue-400/20 bg-blue-50/40"
                      : isToday
                      ? "bg-emerald-50/20 border-emerald-200/80 shadow-xs"
                      : "bg-slate-50/70 border-slate-200"
                  }`}
                >
                  {/* Column Header */}
                  <div className={`pb-2.5 mb-2.5 ${col.indicatorColor}`}>
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-black uppercase tracking-wider ${
                          isToday ? "text-emerald-800" : "text-slate-800"
                        }`}
                      >
                        {col.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isToday
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200/80 text-slate-700"
                          }`}
                        >
                          {colTasks.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenCreateForDate(col.dateStr)}
                          title="Поставить задачу на этот день"
                          className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {col.subtitle}
                    </div>
                  </div>

                  {/* Cards Container */}
                  <div className="space-y-2.5 min-h-[140px]">
                    {colTasks.length === 0 ? (
                      <div className="h-28 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                        <span className="text-[11px]">Нет задач</span>
                        <button
                          type="button"
                          onClick={() => handleOpenCreateForDate(col.dateStr)}
                          className="text-[10px] text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Добавить</span>
                        </button>
                      </div>
                    ) : (
                      colTasks.map(renderTaskCard)
                    )}
                  </div>
                </div>
              );
            })}

            {/* COLUMN: ПОЗЖЕ */}
            <div
              onDragOver={(e) => handleDragOver(e, "later")}
              onDrop={(e) => handleDrop(e, "later")}
              className={`w-[290px] shrink-0 bg-slate-50/50 border rounded-2xl p-3 flex flex-col transition-colors ${
                dragOverColumnId === "later"
                  ? "border-blue-400 ring-2 ring-blue-400/20 bg-blue-50/40"
                  : "border-slate-200"
              }`}
            >
              <div className="pb-2.5 mb-2.5 border-b-2 border-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    ПОЗЖЕ
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                    {kanbanGrouped.later.length}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Следующая неделя и будущие
                </div>
              </div>

              <div className="space-y-2.5 min-h-[120px]">
                {kanbanGrouped.later.length === 0 ? (
                  <div className="h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                    Нет будущих задач
                  </div>
                ) : (
                  kanbanGrouped.later.map(renderTaskCard)
                )}
              </div>
            </div>

            {/* COLUMN: ВЫПОЛНЕННЫЕ */}
            <div
              onDragOver={(e) => handleDragOver(e, "completed")}
              onDrop={(e) => handleDrop(e, "completed")}
              className={`w-[290px] shrink-0 bg-slate-50/30 border rounded-2xl p-3 flex flex-col transition-colors ${
                dragOverColumnId === "completed"
                  ? "border-emerald-400 ring-2 ring-emerald-400/20 bg-emerald-50/40"
                  : "border-slate-200"
              }`}
            >
              <div className="pb-2.5 mb-2.5 border-b-2 border-emerald-600">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                    ВЫПОЛНЕННЫЕ
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {kanbanGrouped.completed.length}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Перетащите сюда для завершения
                </div>
              </div>

              <div className="space-y-2.5 min-h-[120px]">
                {kanbanGrouped.completed.length === 0 ? (
                  <div className="h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                    Нет завершенных задач
                  </div>
                ) : (
                  kanbanGrouped.completed.map(renderTaskCard)
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= VIEW 2: TASKS LIST TABLE ================= */
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
                      !task.isCompleted && getLocalDateString(task.dueDate) < todayStr;
                    const isToday =
                      !task.isCompleted && getLocalDateString(task.dueDate) === todayStr;
                    const typeInfo = getTaskTypeInfo(task.taskType);

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
                            onChange={() => {
                              if (task.isCompleted) {
                                toggleTaskCompleted(task.id, false);
                                router.refresh();
                              } else {
                                setCompletingTaskId(task.id);
                              }
                            }}
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
                              className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${typeInfo.badgeBg}`}
                            >
                              {typeInfo.label}
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
                              <Link
                                href="/deals"
                                className="font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                              >
                                <Briefcase className="w-3 h-3 text-blue-500" />
                                <span>{task.deal.title}</span>
                              </Link>
                            ) : null}
                            {task.contact ? (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" />
                                <span>
                                  {task.contact.name}
                                  {task.contact.company ? ` (${task.contact.company})` : ""}
                                </span>
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
      )}

      {/* ================= CREATE TASK MODAL ================= */}
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
                className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                  placeholder="Например: Позвонить и согласовать разбор"
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
                    <option value="CALL">Звонок / Связаться</option>
                    <option value="MEETING">Встреча / Разбор</option>
                    <option value="OFFER">Отправить КП</option>
                    <option value="PAYMENT">Контроль оплаты</option>
                    <option value="MESSAGE">Написать в WhatsApp</option>
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-medium"
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
                    Привязать контакт
                  </label>
                  <select
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="">-- Без контакта --</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ответственный менеджер
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Описание / Комментарий
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Дополнительные детали задачи..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
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
