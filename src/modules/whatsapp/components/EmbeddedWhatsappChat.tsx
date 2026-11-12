"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { WhatsappMessageItem } from "../types";
import {
  getContactWhatsappMessages,
  getDealWhatsappMessages,
  getWhatsappQuickTemplates,
  sendWhatsappMessage,
} from "../actions";
import { WhatsappMessageType } from "@prisma/client";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
import { ChatInput } from "./ChatInput";
import {
  DEFAULT_WHATSAPP_QUICK_TEMPLATES,
  WhatsappQuickTemplate,
} from "@/lib/whatsappTemplates";
import {
  MessageCircle,
  Clock,
  CheckCheck,
  FileText,
  Download,
  Maximize2,
  X,
  RefreshCw,
  Sparkles,
  Send,
} from "lucide-react";

interface EmbeddedWhatsappChatProps {
  contactId?: string;
  dealId?: string;
  contactPhone: string;
  contactName: string;
}

export function EmbeddedWhatsappChat({
  contactId,
  dealId,
  contactPhone,
  contactName,
}: EmbeddedWhatsappChatProps) {
  const [messages, setMessages] = useState<WhatsappMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsappQuickTemplate[]>(
    DEFAULT_WHATSAPP_QUICK_TEMPLATES
  );
  const [draftText, setDraftText] = useState<string>("");
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const cleanPhone = contactPhone.replace(/[^\d+]/g, "").trim();

  useEffect(() => {
    getWhatsappQuickTemplates()
      .then((res) => {
        if (res && res.length > 0) setTemplates(res);
      })
      .catch(() => {});
  }, []);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      let data: WhatsappMessageItem[] = [];
      if (dealId) {
        data = await getDealWhatsappMessages(dealId);
      } else if (contactId) {
        data = await getContactWhatsappMessages(contactId);
      }
      setMessages(data);
    } catch (err) {
      console.error("Failed to load embedded messages:", err);
    } finally {
      setIsLoading(false);
    }
  }, [contactId, dealId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (payload: {
    messageType: WhatsappMessageType;
    textContent?: string;
    mediaUrl?: string;
    fileName?: string;
  }) => {
    if (!cleanPhone) {
      alert("У контакта не указан корректный номер телефона!");
      return;
    }

    const res = await sendWhatsappMessage({
      remoteJid: cleanPhone,
      contactId,
      dealId,
      messageType: payload.messageType,
      textContent: payload.textContent,
      mediaUrl: payload.mediaUrl,
      fileName: payload.fileName,
    });

    if (res.success) {
      await loadMessages();
    } else {
      alert("Ошибка отправки: " + res.error);
    }
  };

  const formatMessageTime = (iso: Date | string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-[480px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Mini Header */}
      <div className="h-11 px-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-800">
            Переписка WhatsApp ({messages.length})
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {contactPhone}
          </span>
        </div>

        <button
          type="button"
          onClick={loadMessages}
          disabled={isLoading}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          title="Обновить сообщения"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
        </button>
      </div>

      {/* Message List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#EFEAE2]/30"
        style={{
          backgroundImage: "radial-gradient(#CBD5E1 0.75px, transparent 0.75px)",
          backgroundSize: "16px 16px",
        }}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 text-center p-4">
            <div className="space-y-1">
              <Clock className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-xs font-medium text-slate-600">Нет сообщений WhatsApp</p>
              <p className="text-[11px] text-slate-400">
                Напишите первое сообщение вручную или отправьте шаблон в 1 клик
              </p>
            </div>

            {templates[0] && (
              <div className="w-full max-w-md bg-white border border-emerald-200 rounded-2xl p-3.5 text-left shadow-xs space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{templates[0].title}</span>
                </div>
                <p className="text-[11px] text-slate-600 whitespace-pre-wrap line-clamp-4 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {templates[0].text}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftText(templates[0].text)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold cursor-pointer"
                  >
                    Подставить в поле
                  </button>
                  <button
                    type="button"
                    disabled={isSendingTemplate || !cleanPhone}
                    onClick={async () => {
                      setIsSendingTemplate(true);
                      await handleSendMessage({
                        messageType: WhatsappMessageType.TEXT,
                        textContent: templates[0].text,
                      });
                      setIsSendingTemplate(false);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isSendingTemplate ? "Отправка..." : "Отправить сразу"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => {
            const isFromMe = msg.fromMe;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isFromMe ? "items-end" : "items-start"}`}
              >
                <span className="text-[10px] text-slate-400 px-1 mb-0.5 font-medium">
                  {isFromMe ? msg.senderName || "Менеджер" : msg.senderName || contactName}
                </span>

                <div
                  className={`relative max-w-[85%] rounded-2xl p-2.5 shadow-xs ${
                    isFromMe
                      ? "bg-emerald-600 text-white rounded-tr-none"
                      : "bg-white text-slate-900 rounded-tl-none border border-slate-200"
                  }`}
                >
                  {/* TEXT */}
                  {msg.messageType === WhatsappMessageType.TEXT && (
                    <p className="text-xs whitespace-pre-wrap break-words leading-relaxed">
                      {msg.textContent}
                    </p>
                  )}

                  {/* AUDIO */}
                  {msg.messageType === WhatsappMessageType.AUDIO && (
                    <VoiceMessagePlayer
                      mediaUrl={msg.mediaUrl || ""}
                      fromMe={isFromMe}
                    />
                  )}

                  {/* IMAGE */}
                  {msg.messageType === WhatsappMessageType.IMAGE && (
                    <div className="space-y-1">
                      <div
                        onClick={() => setSelectedImage(msg.mediaUrl || null)}
                        className="rounded-xl overflow-hidden cursor-pointer"
                      >
                        <img
                          src={msg.mediaUrl || ""}
                          alt="Вложение"
                          className="max-h-44 w-auto rounded-xl object-cover hover:opacity-95"
                        />
                      </div>
                      {msg.textContent && (
                        <p className={`text-xs ${isFromMe ? "text-emerald-50" : "text-slate-700"}`}>
                          {msg.textContent}
                        </p>
                      )}
                    </div>
                  )}

                  {/* DOCUMENT */}
                  {msg.messageType === WhatsappMessageType.DOCUMENT && (
                    <div className="space-y-1">
                      <div
                        className={`p-2 rounded-xl flex items-center gap-2 border text-xs ${
                          isFromMe
                            ? "bg-emerald-700/60 border-emerald-500 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-800"
                        }`}
                      >
                        <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                        <span className="font-semibold truncate">
                          {msg.fileName || "Файл.pdf"}
                        </span>
                        {msg.mediaUrl && (
                          <a
                            href={msg.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-black/10 rounded cursor-pointer ml-auto"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {msg.textContent && (
                        <p className={`text-xs ${isFromMe ? "text-emerald-50" : "text-slate-700"}`}>
                          {msg.textContent}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Time */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                      isFromMe ? "text-emerald-200" : "text-slate-400"
                    }`}
                  >
                    <span>{formatMessageTime(msg.timestamp)}</span>
                    {isFromMe && <CheckCheck className="w-3 h-3 text-emerald-200" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        disabled={isLoading || isSendingTemplate}
        templates={templates}
        draftText={draftText}
        onDraftConsumed={() => setDraftText("")}
      />

      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 p-2 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={selectedImage}
              alt="Увеличенное изображение"
              className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
