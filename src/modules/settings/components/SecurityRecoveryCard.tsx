"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  ShieldCheck,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Server,
  Info,
} from "lucide-react";
import {
  updateAdminRecoveryEmail,
  saveSmtpSettings,
  testSmtpConnection,
} from "../actions";

interface SmtpSettingsProps {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  hasPassword: boolean;
}

interface SecurityRecoveryCardProps {
  adminLoginEmail: string;
  adminRecoveryEmail: string | null;
  smtpSettings: SmtpSettingsProps | null;
  envSmtpConfigured: boolean;
}

export function SecurityRecoveryCard({
  adminLoginEmail,
  adminRecoveryEmail,
  smtpSettings,
  envSmtpConfigured,
}: SecurityRecoveryCardProps) {
  const router = useRouter();

  // Recovery email state
  const [recoveryEmail, setRecoveryEmail] = useState(adminRecoveryEmail || "");
  const [savingRecovery, setSavingRecovery] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // SMTP settings state
  const [showSmtpForm, setShowSmtpForm] = useState(
    Boolean(smtpSettings?.enabled || smtpSettings?.host)
  );
  const [host, setHost] = useState(smtpSettings?.host || "");
  const [port, setPort] = useState(String(smtpSettings?.port || 465));
  const [user, setUser] = useState(smtpSettings?.user || "");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState(smtpSettings?.fromEmail || "");
  const [fromName, setFromName] = useState(smtpSettings?.fromName || "DAMA CRM");
  const [enabled, setEnabled] = useState(smtpSettings?.enabled ?? true);
  const [hasSavedPassword, setHasSavedPassword] = useState(
    Boolean(smtpSettings?.hasPassword)
  );

  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSaveRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRecovery(true);
    setRecoveryMsg(null);

    const formData = new FormData();
    formData.set("recoveryEmail", recoveryEmail);

    const res = await updateAdminRecoveryEmail(formData);
    setSavingRecovery(false);

    if (!res.success) {
      setRecoveryMsg({
        type: "error",
        text: res.error || "Не удалось сохранить почту",
      });
    } else {
      setRecoveryMsg({
        type: "success",
        text: res.recoveryEmail
          ? `Почта ${res.recoveryEmail} успешно привязана к аккаунту администратора!`
          : "Почта для восстановления очищена.",
      });
      router.refresh();
    }
  };

  const applyPreset = (preset: "gmail" | "yandex" | "mailru") => {
    if (preset === "gmail") {
      setHost("smtp.gmail.com");
      setPort("465");
    } else if (preset === "yandex") {
      setHost("smtp.yandex.ru");
      setPort("465");
    } else if (preset === "mailru") {
      setHost("smtp.mail.ru");
      setPort("465");
    }
    setEnabled(true);
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    setSmtpMsg(null);

    const formData = new FormData();
    formData.set("host", host);
    formData.set("port", port);
    formData.set("secure", parseInt(port, 10) === 465 ? "true" : "false");
    formData.set("user", user);
    formData.set("password", password);
    formData.set("fromEmail", fromEmail || user);
    formData.set("fromName", fromName);
    formData.set("enabled", enabled ? "true" : "false");

    const res = await saveSmtpSettings(formData);
    setSavingSmtp(false);

    if (!res.success) {
      setSmtpMsg({
        type: "error",
        text: res.error || "Не удалось сохранить настройки SMTP",
      });
    } else {
      if (password.trim()) {
        setHasSavedPassword(true);
        setPassword("");
      }
      setSmtpMsg({
        type: "success",
        text: "Настройки почтового сервера (SMTP) сохранены!",
      });
      router.refresh();
    }
  };

  const handleTestEmail = async () => {
    const target = (recoveryEmail || adminLoginEmail).trim();
    setTestingSmtp(true);
    setSmtpMsg(null);

    const res = await testSmtpConnection(target);
    setTestingSmtp(false);

    if (!res.success) {
      setSmtpMsg({
        type: "error",
        text: res.error || "Ошибка отправки тестового письма",
      });
    } else {
      setSmtpMsg({
        type: "success",
        text: `Тестовое письмо успешно отправлено на ${target}! Проверьте входящие (и папку Спам).`,
      });
    }
  };

  const isEmailDeliveryReady =
    Boolean(smtpSettings?.enabled && smtpSettings?.host) || envSmtpConfigured;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900">
                Восстановление пароля и почта Администратора
              </h3>
              {adminRecoveryEmail ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Почта привязана
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  Почта не привязана
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Привяжите личную или корпоративную почту к аккаунту администратора, чтобы сбрасывать пароль через ссылку «Забыли пароль?» на странице входа.
            </p>
          </div>
        </div>
      </div>

      {/* Part 1: Admin Recovery Email Binding */}
      <form
        onSubmit={handleSaveRecoveryEmail}
        className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Почта для восстановления пароля (текущий логин:{" "}
              <span className="text-blue-700">{adminLoginEmail}</span>)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="director@da-marketing.pro"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingRecovery}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingRecovery ? "Сохранение..." : "Привязать почту"}</span>
          </button>
        </div>

        {recoveryMsg && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
              recoveryMsg.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            {recoveryMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{recoveryMsg.text}</span>
          </div>
        )}
      </form>

      {/* Part 2: SMTP Configuration */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-600" />
            <span className="text-xs font-bold text-slate-800">
              Почтовый сервер для отправки писем (SMTP)
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                isEmailDeliveryReady
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {isEmailDeliveryReady ? "Настроен" : "Не настроен"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowSmtpForm(!showSmtpForm)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer self-start sm:self-auto"
          >
            {showSmtpForm ? "Скрыть настройки SMTP" : "Настроить отправку писем"}
          </button>
        </div>

        {showSmtpForm && (
          <form onSubmit={handleSaveSmtp} className="p-4 space-y-4 border-t border-slate-200">
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-slate-700 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p>
                  Чтобы CRM могла сама отправлять письма сброса пароля, подключите любой почтовый ящик (Gmail, Яндекс или Mail.ru). Настройка выполняется здесь один раз — в Coolify заходить не нужно.
                </p>
                <p className="text-[11px] text-slate-600">
                  Для Gmail или Яндекс используйте <strong>Пароль приложения</strong> (App Password) из раздела безопасности аккаунта, а не обычный пароль.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-slate-500">Быстрый шаблон:</span>
              <button
                type="button"
                onClick={() => applyPreset("gmail")}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
              >
                Gmail
              </button>
              <button
                type="button"
                onClick={() => applyPreset("yandex")}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
              >
                Яндекс Почта
              </button>
              <button
                type="button"
                onClick={() => applyPreset("mailru")}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
              >
                Mail.ru
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  SMTP сервер (Host)
                </label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Порт (465 SSL или 587 TLS)
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="465"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Логин SMTP (Email ящика)
                </label>
                <input
                  type="email"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="your.agency@gmail.com"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Пароль приложения SMTP
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    hasSavedPassword
                      ? "•••••••• (сохранен — оставьте пустым)"
                      : "Вставьте App Password"
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  От кого (Email)
                </label>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder={user || "noreply@da-marketing.pro"}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Имя отправителя
                </label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="DAMA CRM"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Включить отправку писем восстановления пароля через этот SMTP</span>
            </label>

            {smtpMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  smtpMsg.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                }`}
              >
                {smtpMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{smtpMsg.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={testingSmtp || !isEmailDeliveryReady}
                onClick={handleTestEmail}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {testingSmtp
                    ? "Отправка теста..."
                    : `Отправить тест на ${recoveryEmail || adminLoginEmail}`}
                </span>
              </button>

              <button
                type="submit"
                disabled={savingSmtp}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSmtp ? "Сохранение..." : "Сохранить SMTP"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
