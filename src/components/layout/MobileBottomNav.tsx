"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  KanbanSquare,
  CheckSquare,
  MessageCircle,
  Users,
  Settings,
  LayoutDashboard,
  Bell,
} from "lucide-react";
import { useTaskAlerts } from "@/contexts/TaskAlertsContext";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { overdueCount, hasUpcoming15MinTask } = useTaskAlerts();

  const navItems = [
    {
      title: "Сделки",
      href: "/deals",
      icon: KanbanSquare,
      active: pathname.startsWith("/deals"),
    },
    {
      title: "Задачи",
      href: "/tasks",
      icon: CheckSquare,
      active: pathname.startsWith("/tasks"),
      badgeCount: overdueCount > 0 ? overdueCount : undefined,
      hasPing: hasUpcoming15MinTask,
    },
    {
      title: "WhatsApp",
      href: "/whatsapp",
      icon: MessageCircle,
      active: pathname.startsWith("/whatsapp"),
    },
    {
      title: "Дашборд",
      href: "/",
      icon: LayoutDashboard,
      active: pathname === "/" || pathname.startsWith("/dashboard"),
    },
    {
      title: "Настройки",
      href: "/settings",
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1 shadow-lg pb-[env(safe-area-inset-bottom,0.5rem)]">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-semibold transition-all relative",
                item.active
                  ? "text-blue-600 font-bold"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "w-5 h-5 transition-transform",
                    item.active ? "scale-110 text-blue-600" : "text-slate-500"
                  )}
                />
                {item.badgeCount ? (
                  <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                    {item.badgeCount}
                  </span>
                ) : item.hasPing ? (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                ) : null}
              </div>
              <span className="mt-0.5 truncate max-w-[60px]">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
