"use client";

import { useState } from "react";
import {
  X,
  Calendar,
  Copy,
  Check,
  ExternalLink,
  Bell,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

interface CalendarSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  icsUrl?: string;
}

export function CalendarSyncModal({
  isOpen,
  onClose,
  icsUrl = "https://crm.da-marketing.pro/api/calendar/admin.ics",
}: CalendarSyncModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(icsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const googleAddUrl = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

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
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Синхронизация с Google Календарём
              </h3>
              <p className="text-[11px] text-slate-500">
                Подключение задач Admin к вашему календарю и уведомлениям
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

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Account info banner */}
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-blue-950">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Подключённый Google-аккаунт:</span>
            </div>
            <p className="pl-5 font-mono text-xs text-blue-800">
              vppf.able@gmail.com
            </p>
            <p className="pl-5 text-[11px] text-blue-700">
              Все задачи CRM, где ответственным назначен <strong>Admin</strong>, транслируются в единый поток подписки.
            </p>
          </div>

          {/* Subscription URL Field */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 block">
              URL-ссылка календаря для подписки (.ics):
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-800 truncate select-all">
                {icsUrl}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Копировать</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step-by-step instructions */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Как подключить за 1 минуту:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 text-[11px] leading-relaxed">
              <li>
                Нажмите кнопку <strong>«Скопировать»</strong> выше.
              </li>
              <li>
                Нажмите кнопку ниже <strong>«Открыть Google Календарь»</strong> — откроется окно добавления календаря по URL.
              </li>
              <li>
                Вставьте скопированную ссылку в поле <strong>«URL календаря»</strong> и нажмите <strong>«Добавить календарь»</strong>.
              </li>
            </ol>
          </div>

          {/* Notifications info */}
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
            <Bell className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold">Уведомления:</span> Google Календарь автоматически присылает пуши и звуковые напоминания за 15 и за 10 минут до срока задачи на телефоне, компьютере и часах.
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold cursor-pointer"
            >
              Закрыть
            </button>
            <a
              href={googleAddUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <span>Открыть Google Календарь</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
