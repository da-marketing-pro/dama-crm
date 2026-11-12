"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { ChatConversation, WhatsappMessageItem } from "../types";
import { ChatList } from "./ChatList";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ChatClientCard } from "./ChatClientCard";
import {
  getChatConversations,
  getChatMessages,
  getWhatsappQuickTemplates,
  markConversationAsWorkChat,
  sendWhatsappMessage,
} from "../actions";
import { WhatsappMessageType } from "@prisma/client";
import {
  DEFAULT_WHATSAPP_QUICK_TEMPLATES,
  WhatsappQuickTemplate,
} from "@/lib/whatsappTemplates";
import { MessageCircle, Settings, RefreshCw, Send, ShieldBan, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface PipelineOption {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    color: string;
    type: string;
  }[];
}

interface WhatsappChatViewProps {
  initialConversations: ChatConversation[];
  pipelines: PipelineOption[];
  isAdmin: boolean;
}

export function WhatsappChatView({
  initialConversations,
  pipelines,
  isAdmin,
}: WhatsappChatViewProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeRemoteJid, setActiveRemoteJid] = useState<string | null>(
    initialConversations.length > 0 ? initialConversations[0].remoteJid : null
  );
  const [messages, setMessages] = useState<WhatsappMessageItem[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const workDialogRef = useRef<HTMLDialogElement | null>(null);
  const workDialogTitleId = useId();
  const [workDialogTarget, setWorkDialogTarget] = useState<ChatConversation | null>(null);
  const [deleteAutoLeadChecked, setDeleteAutoLeadChecked] = useState(true);
  const [isMarkingWorkChat, setIsMarkingWorkChat] = useState(false);
  const [workChatError, setWorkChatError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsappQuickTemplate[]>(
    DEFAULT_WHATSAPP_QUICK_TEMPLATES
  );

  useEffect(() => {
    getWhatsappQuickTemplates()
      .then((res) => {
        if (res && res.length > 0) setTemplates(res);
      })
      .catch(() => {});
  }, []);

  // Load messages whenever active conversation changes
  const loadMessages = useCallback(async (jid: string) => {
    setIsLoadingMessages(true);
    try {
      const data = await getChatMessages(jid);
      setMessages(data);
    } catch (err) {
      console.error("Failed to load chat messages:", err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeRemoteJid) {
      loadMessages(activeRemoteJid);
    } else {
      setMessages([]);
    }
  }, [activeRemoteJid, loadMessages]);

  // Periodic polling for incoming messages (every 5s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updatedConversations = await getChatConversations();
        setConversations(updatedConversations);

        if (activeRemoteJid) {
          const currentMsgs = await getChatMessages(activeRemoteJid);
          setMessages(currentMsgs);
        }
      } catch (err) {
        // Silently handle polling errors
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeRemoteJid]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const updated = await getChatConversations();
      setConversations(updated);
      if (activeRemoteJid) {
        const msgs = await getChatMessages(activeRemoteJid);
        setMessages(msgs);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeConversation = conversations.find((c) => c.remoteJid === activeRemoteJid);

  const handleSendMessage = async (payload: {
    messageType: WhatsappMessageType;
    textContent?: string;
    mediaUrl?: string;
    fileName?: string;
  }) => {
    if (!activeRemoteJid) return;

    // Call server action
    const res = await sendWhatsappMessage({
      remoteJid: activeRemoteJid,
      contactId: activeConversation?.contactId || undefined,
      dealId: activeConversation?.deal?.id || undefined,
      messageType: payload.messageType,
      textContent: payload.textContent,
      mediaUrl: payload.mediaUrl,
      fileName: payload.fileName,
    });

    if (res.success) {
      // Refresh messages
      await loadMessages(activeRemoteJid);
      const updatedConversations = await getChatConversations();
      setConversations(updatedConversations);
    } else {
      alert("Ошибка отправки: " + res.error);
    }
  };

  const handleOpenContact = () => {
    if (activeConversation?.contactId) {
      router.push(`/contacts?contactId=${activeConversation.contactId}`);
    }
  };

  const handleOpenDeal = () => {
    if (activeConversation?.deal?.id) {
      router.push(`/deals?dealId=${activeConversation.deal.id}`);
    }
  };

  const handleDealStageChanged = async () => {
    const updated = await getChatConversations();
    setConversations(updated);
  };

  useEffect(() => {
    const dialog = workDialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e: PointerEvent) => {
      pressedOutside = dialog.open && isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && dialog.open && isOutside(e)) dialog.close();
      pressedOutside = false;
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  const handleOpenWorkChatDialog = () => {
    if (!activeConversation) return;
    const isAutoDeal = Boolean(
      activeConversation.deal &&
        activeConversation.deal.title.startsWith("Лид из WhatsApp:") &&
        activeConversation.deal.totalBudget === 0
    );
    setWorkDialogTarget(activeConversation);
    setDeleteAutoLeadChecked(isAutoDeal);
    setWorkChatError(null);
    workDialogRef.current?.showModal();
  };

  const handleConfirmWorkChat = async () => {
    if (!workDialogTarget) return;
    setIsMarkingWorkChat(true);
    setWorkChatError(null);

    const isAutoDealEligible = Boolean(
      workDialogTarget.deal &&
        workDialogTarget.deal.title.startsWith("Лид из WhatsApp:") &&
        workDialogTarget.deal.totalBudget === 0
    );

    const res = await markConversationAsWorkChat({
      remoteJid: workDialogTarget.remoteJid,
      contactId: workDialogTarget.contactId,
      displayName: workDialogTarget.contactName,
      deleteAutoCreatedLead: isAutoDealEligible && deleteAutoLeadChecked,
    });

    setIsMarkingWorkChat(false);
    if (!res.success) {
      setWorkChatError(res.error || "Не удалось пометить диалог");
      return;
    }

    workDialogRef.current?.close();
    const updated = await getChatConversations();
    setConversations(updated);
    if (activeRemoteJid === workDialogTarget.remoteJid) {
      setActiveRemoteJid(updated.length > 0 ? updated[0].remoteJid : null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] -m-4 md:-m-6">
      {/* Top Bar */}
      <div className="h-13 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">
              Чаты WhatsApp
            </h1>
            <p className="text-[11px] text-slate-400">
              Единый центр диалогов с клиентами и автосоздание лидов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
            title="Обновить переписку"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
            <span className="hidden sm:inline">Обновить</span>
          </button>

          <Link
            href="/settings/whatsapp"
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Настройка шлюза</span>
          </Link>
        </div>
      </div>

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Chat List */}
        <ChatList
          conversations={conversations}
          activeRemoteJid={activeRemoteJid}
          onSelectConversation={(jid) => setActiveRemoteJid(jid)}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* Center Column: Chat Messages & Input */}
        {activeConversation ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <ChatMessages
              conversation={activeConversation}
              messages={messages}
              onOpenContact={handleOpenContact}
              onOpenDeal={handleOpenDeal}
              onMarkWorkChat={handleOpenWorkChatDialog}
            />
            <ChatInput
              onSendMessage={handleSendMessage}
              disabled={isLoadingMessages}
              templates={templates}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 shadow-sm">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Выберите диалог для просмотра переписки
            </h3>
            <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
              Здесь отображаются все входящие и исходящие сообщения WhatsApp. Если у вас еще нет активных диалогов, протестируйте интеграцию в симуляторе.
            </p>
            <Link
              href="/settings/whatsapp"
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Запустить симулятор входящего лида</span>
            </Link>
          </div>
        )}

        {/* Right Column: Contact & Deal Mini Card */}
        {activeConversation && (
          <ChatClientCard
            conversation={activeConversation}
            pipelines={pipelines}
            onOpenContact={handleOpenContact}
            onOpenDeal={handleOpenDeal}
            onDealStageChanged={handleDealStageChanged}
          />
        )}
      </div>

      {/* Native <dialog> confirmation for "Рабочий чат (не лид)" */}
      <dialog
        ref={workDialogRef}
        aria-labelledby={workDialogTitleId}
        {...({ closedby: "any" } as Record<string, string>)}
        className="rounded-2xl max-w-md w-[calc(100%-2rem)] p-0 shadow-2xl border border-slate-200 bg-white m-auto overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShieldBan className="w-4 h-4 text-amber-600" />
            <h2 id={workDialogTitleId} className="text-sm font-bold text-slate-900">
              Перенести в рабочие чаты (не лид)?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => workDialogRef.current?.close()}
            aria-label="Закрыть диалог подтверждения"
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs text-slate-600">
          <p>
            Номер{" "}
            <strong className="font-mono text-slate-900">
              {workDialogTarget?.contactPhone || workDialogTarget?.remoteJid}
            </strong>{" "}
            ({workDialogTarget?.contactName}) будет добавлен в стоп-лист.
          </p>
          <p>
            Этот чат скроется из CRM-раздела «Чаты WhatsApp», а новые сообщения от него больше не будут создавать лиды (вернуть номер можно в любой момент в Настройках WhatsApp).
          </p>

          {workDialogTarget?.deal &&
          workDialogTarget.deal.title.startsWith("Лид из WhatsApp:") &&
          workDialogTarget.deal.totalBudget === 0 ? (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteAutoLeadChecked}
                onChange={(e) => setDeleteAutoLeadChecked(e.target.checked)}
                className="mt-0.5 accent-amber-600 rounded"
              />
              <span className="text-xs text-amber-950">
                Удалить ошибочно созданный авто-лид{" "}
                <strong className="font-semibold">«{workDialogTarget.deal.title}»</strong> из воронки
              </span>
            </label>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
              Существующие карточки контакта и сделок в CRM не будут удалены.
            </div>
          )}

          {workChatError && (
            <p role="alert" className="text-xs text-rose-600 font-medium">
              {workChatError}
            </p>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => workDialogRef.current?.close()}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirmWorkChat}
            disabled={isMarkingWorkChat}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {isMarkingWorkChat ? "Сохраняем..." : "Да, это рабочий чат"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
