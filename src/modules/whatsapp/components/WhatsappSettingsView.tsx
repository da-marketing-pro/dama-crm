"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  QrCode,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  RefreshCw,
  Power,
  Shield,
  FileText,
  Image as ImageIcon,
  Mic,
  ArrowRight,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { WhatsappStatus, WhatsappMessageType } from "@prisma/client";
import {
  updateInstanceSettings,
  requestWhatsappQrCode,
  checkWhatsappConnectionState,
  disconnectWhatsappInstance,
  processIncomingWhatsappWebhook,
} from "../actions";
import { WhatsappFilteringData, WhatsappInstanceData } from "../types";
import { WhatsappFilterSettings } from "./WhatsappFilterSettings";

interface WhatsappSettingsViewProps {
  initialInstance: WhatsappInstanceData;
  initialFilteringData: WhatsappFilteringData;
  isAdmin: boolean;
}

export function WhatsappSettingsView({
  initialInstance,
  initialFilteringData,
  isAdmin,
}: WhatsappSettingsViewProps) {
  const [instance, setInstance] = useState<WhatsappInstanceData>(initialInstance);
  const [formData, setFormData] = useState({
    name: initialInstance.name,
    phoneNumber: initialInstance.phoneNumber || "",
    apiUrl: initialInstance.apiUrl || "https://wa.da-marketing.pro",
    apiKey: initialInstance.apiKey || "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Real Evolution API QR Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [qrDiagnostic, setQrDiagnostic] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrWebhookConfigured, setQrWebhookConfigured] = useState(false);

  // Webhook copy
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Simulator State
  const [simPhone, setSimPhone] = useState("+7 (777) 123-45-67");
  const [simName, setSimName] = useState("Алексей Смирнов");
  const [simType, setSimType] = useState<WhatsappMessageType>(WhatsappMessageType.TEXT);
  const [simText, setSimText] = useState("Здравствуйте! Хочу запросить коммерческое предложение и прайс-лист.");
  const [simMediaUrl] = useState("https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600");
  const [simFileName] = useState("Коммерческое_предложение.pdf");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{
    success: boolean;
    ignored?: boolean;
    reason?: string;
    contactId?: string;
    dealId?: string | null;
    messageId?: string;
    isNewContact?: boolean;
    error?: string;
  } | null>(null);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : "/api/webhooks/whatsapp";

  const refreshLiveStatus = useCallback(async (silent = false) => {
    if (!silent) {
      setIsCheckingStatus(true);
      setErrorMsg(null);
    }
    const res = await checkWhatsappConnectionState(instance.id);
    if (!silent) setIsCheckingStatus(false);

    if (res.ok) {
      setInstance((prev) => ({
        ...prev,
        status: res.status,
        phoneNumber: res.phoneNumber ?? prev.phoneNumber,
      }));
      if (res.phoneNumber) {
        setFormData((prev) => ({ ...prev, phoneNumber: res.phoneNumber || prev.phoneNumber }));
      }
      return res;
    } else if (!silent && res.error) {
      setErrorMsg(res.error);
    }
    return null;
  }, [instance.id]);

  // При загрузке страницы сверяем фактический статус с Evolution API
  useEffect(() => {
    if (
      initialInstance.apiUrl &&
      !initialInstance.apiUrl.includes("api.waha.dev")
    ) {
      refreshLiveStatus(true);
    }
  }, [initialInstance.apiUrl, refreshLiveStatus]);

  // Автоматическая проверка каждые 2 сек пока открыто окно QR-кода (ждём скан ИЛИ асинхронный QRCODE_UPDATED)
  useEffect(() => {
    if (!showQrModal || qrLoading || (!qrBase64 && !awaitingWebhook)) return;

    let waitTicks = 0;
    const timer = setInterval(async () => {
      const res = await checkWhatsappConnectionState(instance.id);
      if (res?.ok && res.state === "open") {
        setInstance((prev) => ({
          ...prev,
          status: WhatsappStatus.CONNECTED,
          phoneNumber: res.phoneNumber ?? prev.phoneNumber,
        }));
        if (res.phoneNumber) {
          setFormData((prev) => ({ ...prev, phoneNumber: res.phoneNumber || prev.phoneNumber }));
        }
        setShowQrModal(false);
        setAwaitingWebhook(false);
        setQrBase64(null);
        setStatusBanner(
          `WhatsApp успешно подключён${res.phoneNumber ? ` (${res.phoneNumber})` : ""}!`
        );
        setTimeout(() => setStatusBanner(null), 5000);
        return;
      }

      if (res?.ok && !qrBase64 && res.qrBase64) {
        setQrBase64(res.qrBase64);
        setPairingCode(res.pairingCode || null);
        setAwaitingWebhook(false);
        setInstance((prev) => ({ ...prev, status: WhatsappStatus.QR_READY }));
        return;
      }

      if (!qrBase64 && awaitingWebhook) {
        waitTicks += 1;
        if (waitTicks >= 10) {
          setAwaitingWebhook(false);
          setQrError(
            `Evolution API не прислал QR-код${
              qrDiagnostic ? ` (${qrDiagnostic})` : ""
            }. Нажмите «Обновить QR-код» ещё раз.`
          );
        }
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [showQrModal, qrLoading, qrBase64, awaitingWebhook, qrDiagnostic, instance.id]);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    const res = await updateInstanceSettings(instance.id, {
      name: formData.name,
      phoneNumber: formData.phoneNumber,
      apiUrl: formData.apiUrl,
      apiKey: formData.apiKey,
    });

    setIsSaving(false);
    if (res.success && res.instance) {
      setInstance({
        ...instance,
        name: res.instance.name,
        phoneNumber: res.instance.phoneNumber,
        apiUrl: res.instance.apiUrl,
        apiKey: res.instance.apiKey,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setErrorMsg(res.error || "Ошибка при сохранении настроек");
    }
  };

  const handleOpenAndFetchQr = async () => {
    if (!isAdmin) return;
    setShowQrModal(true);
    setQrLoading(true);
    setAwaitingWebhook(false);
    setQrDiagnostic(null);
    setQrError(null);
    setQrBase64(null);
    setPairingCode(null);
    setQrWebhookConfigured(false);
    setErrorMsg(null);

    const res = await requestWhatsappQrCode({
      instanceId: instance.id,
      name: formData.name,
      apiUrl: formData.apiUrl,
      apiKey: formData.apiKey,
      webhookUrl: webhookUrl.startsWith("http") ? webhookUrl : undefined,
    });

    setQrLoading(false);

    if (!res.success) {
      setQrError(res.error || "Не удалось получить QR-код от Evolution API");
      return;
    }

    if (res.instanceName && res.instanceName !== formData.name) {
      setFormData((prev) => ({ ...prev, name: res.instanceName || prev.name }));
    }
    setQrWebhookConfigured(Boolean(res.webhookConfigured));

    if (res.connected) {
      setInstance((prev) => ({
        ...prev,
        status: WhatsappStatus.CONNECTED,
        phoneNumber: res.phoneNumber ?? prev.phoneNumber,
      }));
      if (res.phoneNumber) {
        setFormData((prev) => ({ ...prev, phoneNumber: res.phoneNumber || prev.phoneNumber }));
      }
      setShowQrModal(false);
      setStatusBanner(
        `Номер уже подключён в Evolution API${res.phoneNumber ? ` (${res.phoneNumber})` : ""}!`
      );
      setTimeout(() => setStatusBanner(null), 5000);
      return;
    }

    if (res.qrBase64) {
      setInstance((prev) => ({ ...prev, status: WhatsappStatus.QR_READY }));
      setQrBase64(res.qrBase64);
      setPairingCode(res.pairingCode || null);
      return;
    }

    if (res.awaitingWebhook) {
      setInstance((prev) => ({ ...prev, status: WhatsappStatus.QR_READY }));
      setAwaitingWebhook(true);
      setQrDiagnostic(res.diagnostic || null);
      return;
    }

    setQrError("Evolution API не вернул QR-код. Нажмите «Обновить QR-код».");
  };

  const handleDisconnect = async () => {
    if (!confirm("Вы уверены, что хотите отключить этот номер WhatsApp?")) return;
    setErrorMsg(null);
    const res = await disconnectWhatsappInstance(instance.id);
    if (res.success && res.instance) {
      setInstance({
        ...instance,
        status: WhatsappStatus.DISCONNECTED,
      });
    } else if (res.error) {
      setErrorMsg(res.error);
    }
  };

  const handleRunSimulator = async () => {
    setIsSimulating(true);
    setSimResult(null);

    let mediaUrlToSend: string | undefined = undefined;
    let fileNameToSend: string | undefined = undefined;

    if (simType === WhatsappMessageType.IMAGE) {
      mediaUrlToSend = simMediaUrl;
    } else if (simType === WhatsappMessageType.DOCUMENT) {
      mediaUrlToSend = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
      fileNameToSend = simFileName;
    } else if (simType === WhatsappMessageType.AUDIO) {
      // Demo voice note wav
      mediaUrlToSend = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
    }

    const res = await processIncomingWhatsappWebhook({
      phone: simPhone,
      senderName: simName,
      messageType: simType,
      textContent: simText,
      mediaUrl: mediaUrlToSend,
      fileName: fileNameToSend,
      instanceId: instance.id,
    });

    setIsSimulating(false);
    setSimResult(res);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Подключение WhatsApp</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                instance.status === WhatsappStatus.CONNECTED
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : instance.status === WhatsappStatus.QR_READY
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-rose-100 text-rose-800 border border-rose-300"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  instance.status === WhatsappStatus.CONNECTED
                    ? "bg-emerald-500 animate-pulse"
                    : instance.status === WhatsappStatus.QR_READY
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
              />
              {instance.status === WhatsappStatus.CONNECTED
                ? "Подключен (Онлайн)"
                : instance.status === WhatsappStatus.QR_READY
                ? "Ожидает QR"
                : "Отключен"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Шлюз для входящих сообщений, автосоздания контактов, сделок и обмена сообщениями
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshLiveStatus(false)}
            disabled={isCheckingStatus}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? "animate-spin" : ""}`} />
            <span>Проверить статус</span>
          </button>

          <Link
            href="/whatsapp"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Перейти в чаты</span>
          </Link>
        </div>
      </div>

      {statusBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
          <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {/* Grid of Main Settings & Webhook */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Connection & Instance Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">Параметры инстанса Evolution API v2</h2>
              </div>
              {instance.status === WhatsappStatus.CONNECTED ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={!isAdmin}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Отключить номер</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenAndFetchQr}
                  disabled={!isAdmin || qrLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{qrLoading ? "Загрузка QR..." : "Получить QR-код"}</span>
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Настройки инстанса успешно обновлены!</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Название инстанса (латиницей)
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!isAdmin}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono disabled:bg-slate-50"
                    placeholder="da-agency-main"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Привязанный номер телефона
                  </label>
                  <input
                    type="text"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    disabled={!isAdmin}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-slate-50"
                    placeholder="Определится автоматически после QR"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    URL шлюза (Evolution API v2 Endpoint)
                  </label>
                  {isAdmin && formData.apiUrl !== "https://wa.da-marketing.pro" && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, apiUrl: "https://wa.da-marketing.pro" })}
                      className="text-[11px] font-medium text-emerald-700 hover:underline cursor-pointer"
                    >
                      Подставить https://wa.da-marketing.pro
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.apiUrl}
                  onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                  disabled={!isAdmin}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono disabled:bg-slate-50"
                  placeholder="https://wa.da-marketing.pro"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Укажите адрес вашего Evolution API (например, https://wa.da-marketing.pro или внутренний http://сервис:8080)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  API Ключ (AUTHENTICATION_API_KEY)
                </label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  disabled={!isAdmin}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono disabled:bg-slate-50"
                  placeholder={isAdmin ? "Введите глобальный API-ключ Evolution API" : "Скрыто от менеджеров"}
                />
              </div>

              {isAdmin && (
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isSaving ? "Сохранение..." : "Сохранить конфигурацию"}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Webhook Endpoint Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Webhook URL для входящих сообщений</h2>
              </div>
              <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded-md">
                POST Request
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Укажите данный адрес в настройках вашего WhatsApp-шлюза (WAHA, Evolution API или Green API) в поле <strong>Webhook URL</strong>. При получении каждого сообщения сервер автоматически привяжет его к контакту или создаст нового лида.
            </p>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 break-all select-all">
              <span className="flex-1 font-semibold">{webhookUrl}</span>
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-sans text-xs font-semibold shrink-0 flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
              >
                {copiedWebhook ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Скопировано!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Копировать</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Simulator of Incoming Message */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-white rounded-2xl border-2 border-emerald-500/30 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-700" />
                <h2 className="text-sm font-bold text-emerald-950">Симулятор входящего лида</h2>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                Тестирование
              </span>
            </div>

            <p className="text-xs text-emerald-900/80 leading-relaxed">
              Протестируйте сценарий: клиент пишет вам в WhatsApp впервые. Система сразу создаст контакт и карточку сделки в первом этапе воронки («Неразобранное»).
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Номер телефона отправителя
                </label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="+7 (777) 123-45-67"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Имя клиента
                </label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Алексей Смирнов"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Тип сообщения
                </label>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSimType(WhatsappMessageType.TEXT)}
                    className={`py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      simType === WhatsappMessageType.TEXT
                        ? "bg-white text-emerald-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span>Текст</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimType(WhatsappMessageType.AUDIO)}
                    className={`py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      simType === WhatsappMessageType.AUDIO
                        ? "bg-white text-emerald-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Mic className="w-3 h-3" />
                    <span>Голос</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimType(WhatsappMessageType.IMAGE)}
                    className={`py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      simType === WhatsappMessageType.IMAGE
                        ? "bg-white text-emerald-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>Фото</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimType(WhatsappMessageType.DOCUMENT)}
                    className={`py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      simType === WhatsappMessageType.DOCUMENT
                        ? "bg-white text-emerald-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>PDF</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {simType === WhatsappMessageType.AUDIO
                    ? "Подпись к голосовому"
                    : simType === WhatsappMessageType.IMAGE
                    ? "Подпись к фото"
                    : simType === WhatsappMessageType.DOCUMENT
                    ? "Имя файла и комментарий"
                    : "Текст сообщения"}
                </label>
                <textarea
                  rows={2}
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Введите текст сообщения..."
                />
              </div>

              <button
                type="button"
                onClick={handleRunSimulator}
                disabled={isSimulating}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSimulating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Обработка вебхука...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Симулировать входящее сообщение</span>
                  </>
                )}
              </button>
            </div>

            {/* Simulator Result Banner */}
            {simResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
                  simResult.ignored
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : simResult.success
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                {simResult.ignored ? (
                  <>
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Сообщение отфильтровано правилом CRM!</span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Контакт и сделка НЕ созданы. Причина: <strong>{simResult.reason}</strong>
                    </p>
                  </>
                ) : simResult.success ? (
                  <>
                    <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        {simResult.isNewContact
                          ? "Создан новый контакт и сделка в воронке!"
                          : "Сообщение привязано к существующему контакту!"}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      Лид успешно зарегистрирован в базе CRM и доступен в разделе «Чаты WhatsApp» и воронке сделок.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Link
                        href="/whatsapp"
                        className="px-2.5 py-1 bg-emerald-700 text-white rounded-lg text-[11px] font-semibold hover:bg-emerald-800 flex items-center gap-1"
                      >
                        <span>Открыть чат</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                      <Link
                        href="/deals"
                        className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-lg text-[11px] font-semibold hover:bg-emerald-100"
                      >
                        <span>Воронка сделок</span>
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-rose-700 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Ошибка: {simResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lead Filtering, Existing Chats & Business Labels (Options 1 + 2 + 4) */}
      {isAdmin && (
        <WhatsappFilterSettings
          instanceId={instance.id}
          initialData={initialFilteringData}
          webhookUrl={webhookUrl}
          isGatewayConfigured={Boolean(
            formData.apiUrl?.trim() &&
              !formData.apiUrl.includes("api.waha.dev") &&
              (formData.apiKey?.trim() || instance.apiKey)
          )}
        />
      )}

      {/* Real Evolution API QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Подключение WhatsApp Web</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Откройте WhatsApp на телефоне &rarr; Настройки &rarr; Связанные устройства &rarr; Привязка устройства
            </p>

            {/* Real QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200 min-h-[250px]">
              {qrLoading || (awaitingWebhook && !qrBase64) ? (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-xs font-medium text-center">
                    {awaitingWebhook && !qrBase64
                      ? "Ожидаем генерацию QR-кода от Evolution API..."
                      : "Запрашиваем реальный QR-код у Evolution API..."}
                  </span>
                </div>
              ) : qrError ? (
                <div className="flex flex-col items-center gap-2 text-center px-2">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
                  <p className="text-xs font-semibold text-rose-700">
                    Не удалось получить QR-код
                  </p>
                  <p className="text-[11px] text-rose-600 leading-relaxed break-words">
                    {qrError}
                  </p>
                </div>
              ) : qrBase64 ? (
                <>
                  <div className="w-56 h-56 bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-center shadow-sm">
                    <img
                      src={qrBase64}
                      alt="QR-код для подключения WhatsApp"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {pairingCode && (
                    <div className="mt-2 px-3 py-1 bg-white rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800">
                      Код привязки: {pairingCode}
                    </div>
                  )}

                  <span className="text-[11px] text-emerald-700 mt-3 font-medium flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Ожидаем сканирования (проверяем статус автоматически)...
                  </span>

                  {qrWebhookConfigured && (
                    <span className="text-[10px] text-slate-400 mt-1">
                      Webhook входящих сообщений настроен автоматически
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-400">QR-код не получен</span>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleOpenAndFetchQr}
                disabled={qrLoading}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? "animate-spin" : ""}`} />
                <span>{qrLoading ? "Загрузка..." : "Обновить QR-код"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
