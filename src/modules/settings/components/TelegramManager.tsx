"use client";

import { useState, useEffect } from "react";
import {
  getTelegramSettingAction,
  saveTelegramSettingAction,
  testSendTelegramDigestAction,
  syncTelegramWebhookAction,
} from "../telegramActions";
import {
  Send,
  Check,
  AlertCircle,
  ExternalLink,
  Clock,
  Shield,
  MessageSquare,
  Bot,
  Smartphone,
  RefreshCw,
} from "lucide-react";

export function TelegramManager() {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [sendTime, setSendTime] = useState("09:45");
  const [hasToken, setHasToken] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    const res = await getTelegramSettingAction();
    setIsLoading(false);
    if (res.success && res.setting) {
      setBotToken(res.setting.botToken || "");
      setChatId(res.setting.chatId || "");
      setEnabled(res.setting.enabled);
      setSendTime(res.setting.sendTime || "09:45");
      setHasToken(res.setting.hasToken);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setTestResult(null);

    const res = await saveTelegramSettingAction({
      botToken: botToken.trim() || undefined,
      chatId: chatId.trim(),
      enabled,
      sendTime,
    });

    setIsSaving(false);
    if (!res.success) {
      setErrorMessage(res.error || "Ошибка сохранения");
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadSettings();
    }
  };

  const handleTestSend = async () => {
    setIsTesting(true);
    setTestResult(null);
    setErrorMessage(null);

    const res = await testSendTelegramDigestAction();
    setIsTesting(false);

    if (res.success) {
      setTestResult({
        success: true,
        message: `Сводка успешно отправлена в ваш Telegram! (задач в сводке: ${res.count ?? 0})`,
      });
    } else {
      setTestResult({
        success: false,
        message: res.error || (res.skipped === "DISABLED_OR_NOT_CONFIGURED" ? "Интеграция не включена или не заполнены Bot Token и Chat ID" : "Ошибка отправки"),
      });
    }
  };

  const handleSyncWebhook = async () => {
    setIsSyncing(true);
    setTestResult(null);
    setErrorMessage(null);

    const res = await syncTelegramWebhookAction();
    setIsSyncing(false);

    if (res.success) {
      setTestResult({
        success: true,
        message: "Telegram Webhook и меню Mini App успешно синхронизированы! Кнопка «📱 CRM» активна в боте.",
      });
    } else {
      setErrorMessage(res.error || "Ошибка синхронизации вебхука");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
            <Send className="w-5 h-5 -rotate-12" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Интеграция с Telegram</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ежедневная утренняя сводка задач в ваш Telegram в 09:45 (Пн–Сб)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <Check className="w-3.5 h-3.5" /> Сохранено
            </span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {testResult && (
        <div
          className={`p-3 border text-xs rounded-xl flex items-center gap-2 ${
            testResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {testResult.success ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-xs text-slate-400">Загрузка настроек Telegram...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bot Token */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Telegram Bot Token *
                </label>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  <span>@BotFather</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="text"
                required={!hasToken}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={hasToken ? "Токен сохранен (введите новый для замены)" : "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Токен бота, созданного через официального бота @BotFather.
              </p>
            </div>

            {/* Chat ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Ваш Telegram Chat ID *
                </label>
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  <span>@userinfobot</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="text"
                required
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Например: 123456789"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ваш числовой ID в Telegram (отправьте любое сообщение боту @userinfobot).
              </p>
            </div>
          </div>

          {/* Schedule & Enable Toggle */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Включить ежедневную отправку в Telegram
                </span>
                <span className="text-[11px] text-slate-500">
                  Каждое утро (Пн–Сб) в {sendTime} будет приходить сводка задач на день (или «нет задач на сегодня»).
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white font-bold"
              />
            </div>
          </div>

          {/* Telegram Mini App & Webhook status banner */}
          <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-bold text-sky-950">Telegram Mini App CRM</span>
              </div>
              <button
                type="button"
                onClick={handleSyncWebhook}
                disabled={isSyncing || (!hasToken && !botToken)}
                className="text-[11px] font-semibold px-2.5 py-1 bg-white hover:bg-sky-100/60 border border-sky-300 text-sky-700 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Обновить вебхук и привязать кнопку «📱 CRM» в Telegram"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                <span>{isSyncing ? "Синхронизация..." : "Синхронизировать меню бота"}</span>
              </button>
            </div>
            <p className="text-[11px] text-sky-800 leading-relaxed">
              В Telegram встроена полноценная мобильная версия DAMA CRM. В утренней сводке к каждой задаче прикреплена кнопка <b>«💼 Открыть сделку»</b> с автоматической авторизацией. Внизу чата доступна постоянная кнопка <b>«📱 CRM»</b>.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleTestSend}
              disabled={isTesting || (!hasToken && !botToken) || !chatId}
              className="px-4 py-2 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 text-sky-500" />
              <span>{isTesting ? "Отправка..." : "Отправить сводку прямо сейчас (Тест)"}</span>
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSaving ? "Сохранение..." : "Сохранить настройки Telegram"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
