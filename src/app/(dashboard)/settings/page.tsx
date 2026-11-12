import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmployeeManager } from "@/modules/settings/components/EmployeeManager";
import { SecurityRecoveryCard } from "@/modules/settings/components/SecurityRecoveryCard";
import { CurrencyManager } from "@/modules/settings/components/CurrencyManager";
import { PipelinePreview } from "@/modules/settings/components/PipelinePreview";
import { Users, DollarSign, GitBranch, Settings as SettingsIcon, MessageCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const isAdmin = user?.role === "ADMIN";

  const [employees, currencySetting, pipelines, smtpSetting] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        recoveryEmail: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            assignedDeals: true,
            assignedContacts: true,
          },
        },
      },
    }),
    prisma.currencySetting.findFirst(),
    prisma.pipeline.findMany({
      orderBy: { order: "asc" },
      include: {
        stages: {
          orderBy: { order: "asc" },
        },
      },
    }),
    isAdmin ? prisma.smtpSetting.findFirst() : Promise.resolve(null),
  ]);

  const currentAdmin = isAdmin ? employees.find((e) => e.id === user?.id) : undefined;
  const sanitizedSmtp = smtpSetting
    ? {
        host: smtpSetting.host,
        port: smtpSetting.port,
        secure: smtpSetting.secure,
        user: smtpSetting.user,
        fromEmail: smtpSetting.fromEmail,
        fromName: smtpSetting.fromName,
        enabled: smtpSetting.enabled,
        hasPassword: Boolean(smtpSetting.password),
      }
    : null;
  const envSmtpConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Настройки системы</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Управление корпоративной командой (до 10 сотрудников), курсами валют и воронками продаж
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              isAdmin
                ? "bg-amber-100 text-amber-800 border border-amber-300"
                : "bg-slate-100 text-slate-600 border border-slate-300"
            }`}
          >
            {isAdmin ? "Полный доступ (Администратор)" : "Ограниченный режим (Менеджер)"}
          </span>
        </div>
      </div>

      {/* 1. Employee Management Section */}
      <section>
        <EmployeeManager
          employees={employees}
          currentUserId={user?.id || ""}
          isAdmin={isAdmin}
        />
      </section>

      {/* 1.5. Admin Account Security & Password Recovery */}
      {isAdmin && (
        <section>
          <SecurityRecoveryCard
            adminLoginEmail={currentAdmin?.email ?? user?.email ?? ""}
            adminRecoveryEmail={currentAdmin?.recoveryEmail ?? null}
            smtpSettings={sanitizedSmtp}
            envSmtpConfigured={envSmtpConfigured}
          />
        </section>
      )}

      {/* 2. Currency Management Section */}
      <section>
        <CurrencyManager settings={currencySetting} isAdmin={isAdmin} />
      </section>

      {/* 3. Pipeline Configuration Preview */}
      <section>
        <PipelinePreview pipelines={pipelines} isAdmin={isAdmin} />
      </section>

      {/* 4. WhatsApp Integration Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Интеграция с WhatsApp</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Подключение инстанса через QR-код, автосоздание лидов в воронку, входящие вебхуки и симулятор
            </p>
          </div>
        </div>

        <Link
          href="/settings/whatsapp"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-xs"
        >
          <span>Настроить WhatsApp</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </section>
    </div>
  );
}
