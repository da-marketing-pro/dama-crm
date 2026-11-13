"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  MessageCircle,
  CheckSquare,
  Settings,
  LogOut,
  Shield,
  User,
  ChevronRight,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskAlerts } from "@/contexts/TaskAlertsContext";
import { useMobileNav } from "@/contexts/MobileNavContext";
import { X } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { overdueCount, hasUpcoming15MinTask } = useTaskAlerts();
  const { isMobileMenuOpen, closeMobileMenu } = useMobileNav();

  const user = session?.user;
  const isAdmin = user?.role === "ADMIN";

  const navItems = [
    {
      title: "Дашборд",
      href: "/",
      icon: LayoutDashboard,
      active: pathname === "/" || pathname.startsWith("/dashboard"),
    },
    {
      title: "Сделки",
      href: "/deals",
      icon: KanbanSquare,
      active: pathname.startsWith("/deals"),
    },
    {
      title: "Контакты",
      href: "/contacts",
      icon: Users,
      active: pathname.startsWith("/contacts"),
    },
    {
      title: "WhatsApp",
      href: "/whatsapp",
      icon: MessageCircle,
      active: pathname.startsWith("/whatsapp"),
    },
    {
      title: "Задачи",
      href: "/tasks",
      icon: CheckSquare,
      active: pathname.startsWith("/tasks"),
    },
    {
      title: "Настройки",
      href: "/settings",
      icon: Settings,
      active: pathname.startsWith("/settings"),
      badge: isAdmin ? "Admin" : undefined,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={closeMobileMenu}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden animate-in fade-in"
        />
      )}

      {/* Sidebar (Fixed on desktop, Slide-out drawer on mobile) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 w-64 bg-[#1E222D] text-slate-300 flex flex-col z-50 select-none shadow-xl border-r border-[#2C3242] transition-transform duration-200 ease-in-out md:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo & App Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#2C3242]">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="DAMA CRM"
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl object-contain bg-[#FAF9F5] shadow-md border border-white/10 p-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-bold text-sm text-white tracking-wide truncate">DAMA CRM</div>
              <div className="text-[11px] text-slate-400 font-medium truncate">Корпоративная система</div>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={closeMobileMenu}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#2C3242] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      {/* Navigation Menu */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Основное меню
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative",
                item.active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-300 hover:bg-[#2A2F3D] hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 transition-transform group-hover:scale-110",
                  item.active ? "text-white" : "text-slate-400 group-hover:text-blue-400"
                )}
              />
              <span className="flex-1">{item.title}</span>

              {/* Task notification bell (2b): Green if within 15 min, Red with count if overdue */}
              {item.href === "/tasks" && (
                <>
                  {overdueCount > 0 ? (
                    <div
                      className="flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 rounded-full"
                      title={`Просрочено задач: ${overdueCount}`}
                    >
                      <Bell className="w-3.5 h-3.5 text-rose-400 fill-rose-400 animate-pulse" />
                      <span className="text-[10px] font-black text-rose-300">
                        {overdueCount}
                      </span>
                    </div>
                  ) : hasUpcoming15MinTask ? (
                    <div
                      className="flex items-center bg-emerald-500/20 border border-emerald-500/40 p-1 rounded-full"
                      title="Задача начнется менее чем через 15 минут"
                    >
                      <Bell className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 animate-bounce" />
                    </div>
                  ) : null}
                </>
              )}

              {item.badge && (
                <span className="text-[10px] font-semibold bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded border border-blue-400/30">
                  {item.badge}
                </span>
              )}

              {item.active && <ChevronRight className="w-3.5 h-3.5 text-blue-200" />}
            </Link>
          );
        })}
      </div>

      {/* Bottom User Profile Section */}
      <div className="p-3 border-t border-[#2C3242] bg-[#181B24]">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-[#222735] border border-[#2E3547]">
          <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {isAdmin ? (
              <Shield className="w-4 h-4 text-amber-400" />
            ) : (
              <User className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user?.name || "Пользователь"}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full inline-block",
                  isAdmin
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                )}
              >
                {isAdmin ? "Админ" : "Менеджер"}
              </span>
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Выйти"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-[#2F3649] rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
