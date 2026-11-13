"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface TaskAlertItem {
  id: string;
  title: string;
  taskType: string;
  dueDate: string;
  dealTitle?: string | null;
  contactName?: string | null;
  assignedName?: string | null;
}

interface TaskAlertsContextType {
  tasks: TaskAlertItem[];
  upcoming30MinTask: TaskAlertItem | null;
  upcoming30MinLabel: string | null;
  hasUpcoming15MinTask: boolean;
  overdueCount: number;
  pushPermission: NotificationPermission | "unsupported";
  requestPushPermission: () => Promise<void>;
  reloadAlerts: () => Promise<void>;
}

const TaskAlertsContext = createContext<TaskAlertsContextType>({
  tasks: [],
  upcoming30MinTask: null,
  upcoming30MinLabel: null,
  hasUpcoming15MinTask: false,
  overdueCount: 0,
  pushPermission: "default",
  requestPushPermission: async () => {},
  reloadAlerts: async () => {},
});

function getShortActionTitle(taskType: string, date: Date, title: string) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  let action = "Задача";
  switch (taskType) {
    case "CALL":
      action = "Созвон";
      break;
    case "MEETING":
      action = "Встреча";
      break;
    case "OFFER":
      action = "Отправить КП";
      break;
    case "PAYMENT":
      action = "Оплата";
      break;
    case "MESSAGE":
      action = "Написать в WA";
      break;
  }

  const cleanTitle = title.length > 25 ? `${title.slice(0, 25)}...` : title;
  return `${action} в ${timeStr} • ${cleanTitle}`;
}

export function TaskAlertsProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TaskAlertItem[]>([]);
  const [upcoming30MinTask, setUpcoming30MinTask] = useState<TaskAlertItem | null>(null);
  const [upcoming30MinLabel, setUpcoming30MinLabel] = useState<string | null>(null);
  const [hasUpcoming15MinTask, setHasUpcoming15MinTask] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default");

  // Check push permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission("unsupported");
    }
  }, []);

  const requestPushPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setPushPermission(perm);
        if (perm === "granted") {
          new Notification("🔔 Уведомления DAMA CRM включены", {
            body: "Вы будете получать напоминания за 10 минут до наступления срока задачи.",
            icon: "/logo.png",
          });
        }
      } catch (err) {
        console.error("Ошибка запроса разрешения на уведомления:", err);
      }
    }
  };

  const reloadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/alerts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tasks)) {
          setTasks(data.tasks);
        }
      }
    } catch {}
  }, []);

  // Poll alerts every 30 seconds and on window focus
  useEffect(() => {
    reloadAlerts();
    const interval = setInterval(reloadAlerts, 30000);

    const onFocus = () => reloadAlerts();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [reloadAlerts]);

  // Evaluate alerts every 5 seconds against current clock
  useEffect(() => {
    const evaluate = () => {
      const now = Date.now();
      let overdue = 0;
      let has15m = false;
      let closest30m: TaskAlertItem | null = null;
      let closest30mDiff = Infinity;

      tasks.forEach((t) => {
        const dueTime = new Date(t.dueDate).getTime();
        const diffMinutes = (dueTime - now) / 60000;

        // 1. Overdue check
        if (diffMinutes < 0) {
          overdue++;
        }

        // 2. Upcoming 15 minutes check (for green bell)
        if (diffMinutes <= 15 && diffMinutes >= 0) {
          has15m = true;
        }

        // 3. Upcoming 30 minutes check (for top banner)
        // Allow up to 30 mins before, and up to 5 mins after due time
        if (diffMinutes <= 30 && diffMinutes >= -5) {
          if (Math.abs(diffMinutes) < closest30mDiff) {
            closest30m = t;
            closest30mDiff = Math.abs(diffMinutes);
          }
        }

        // 4. Browser Push Notification check (за 10 минут до задачи)
        if (diffMinutes <= 10 && diffMinutes > 0) {
          const storageKey = `crm_notified_10m_${t.id}`;
          const alreadyNotified = localStorage.getItem(storageKey);

          if (!alreadyNotified) {
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              const taskDate = new Date(t.dueDate);
              const hours = String(taskDate.getHours()).padStart(2, "0");
              const minutes = String(taskDate.getMinutes()).padStart(2, "0");

              let actionName = "Задача";
              if (t.taskType === "CALL") actionName = "Созвон";
              if (t.taskType === "MEETING") actionName = "Встреча";
              if (t.taskType === "OFFER") actionName = "Отправить КП";
              if (t.taskType === "PAYMENT") actionName = "Контроль оплаты";

              const notif = new Notification(`⏰ ${actionName} через 10 мин (${hours}:${minutes})`, {
                body: `${t.title}${t.contactName ? ` • Клиент: ${t.contactName}` : ""}`,
                icon: "/logo.png",
                tag: `task-${t.id}`,
              });

              notif.onclick = () => {
                window.focus();
                window.location.href = "/tasks";
              };

              localStorage.setItem(storageKey, "true");
            }
          }
        }
      });

      setOverdueCount(overdue);
      setHasUpcoming15MinTask(has15m);
      setUpcoming30MinTask(closest30m);

      if (closest30m) {
        const item = closest30m as TaskAlertItem;
        setUpcoming30MinLabel(getShortActionTitle(item.taskType, new Date(item.dueDate), item.title));
      } else {
        setUpcoming30MinLabel(null);
      }
    };

    evaluate();
    const ticker = setInterval(evaluate, 5000);
    return () => clearInterval(ticker);
  }, [tasks]);

  return (
    <TaskAlertsContext.Provider
      value={{
        tasks,
        upcoming30MinTask,
        upcoming30MinLabel,
        hasUpcoming15MinTask,
        overdueCount,
        pushPermission,
        requestPushPermission,
        reloadAlerts,
      }}
    >
      {children}
    </TaskAlertsContext.Provider>
  );
}

export function useTaskAlerts() {
  return useContext(TaskAlertsContext);
}
