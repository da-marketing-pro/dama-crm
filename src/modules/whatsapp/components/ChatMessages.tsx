"use client";

import { useEffect, useRef, useState } from "react";
import { WhatsappMessageItem, ChatConversation } from "../types";
import { WhatsappMessageType } from "@prisma/client";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
import {
  FileText,
  Download,
  ExternalLink,
  CheckCheck,
  Check,
  X,
  Maximize2,
  Clock,
  Phone,
  Building,
  User,
  ShieldBan,
} from "lucide-react";

interface ChatMessagesProps {
  conversation: ChatConversation;
  messages: WhatsappMessageItem[];
  onOpenContact?: () => void;
  onOpenDeal?: () => void;
  onMarkWorkChat?: () => void;
}

export function ChatMessages({
  conversation,
  messages,
  onOpenContact,
  onOpenDeal,
  onMarkWorkChat,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const formatMessageTime = (iso: Date | string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#EFEAE2]/40 relative overflow-hidden">
      {/* Chat Header */}
      <div className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            {conversation.contactName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-900">
                {conversation.contactName}
              </h2>
              {conversation.contactPhone && (
                <span className="text-[11px] text-slate-500 font-mono">
                  {conversation.contactPhone}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                WhatsApp онлайн
              </span>
              {conversation.company && (
                <span>• {conversation.company}</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick action buttons in header */}
        <div className="flex items-center gap-2">
          {conversation.contactId && onOpenContact && (
            <button
              type="button"
              onClick={onOpenContact}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Контакт</span>
            </button>
          )}

          {conversation.deal && onOpenDeal && (
            <button
              type="button"
              onClick={onOpenDeal}
              className="px-2.5 py-1 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-opacity hover:opacity-90 cursor-pointer shadow-xs"
              style={{ backgroundColor: conversation.deal.stageColor }}
            >
              <span>Сделка: {conversation.deal.title}</span>
            </button>
          )}

          {onMarkWorkChat && (
            <button
              type="button"
              onClick={onMarkWorkChat}
              title="Пометить как рабочий чат (не лид) и добавить номер в стоп-лист"
              className="px-2.5 py-1 text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ShieldBan className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Рабочий чат (не лид)</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-pattern"
        style={{
          backgroundImage:
            "radial-gradient(#CBD5E1 0.75px, transparent 0.75px)",
          backgroundSize: "16px 16px",
        }}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Clock className="w-8 h-8 text-slate-300" />
            <p className="text-xs">В этом диалоге еще нет сообщений</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isFromMe = msg.fromMe;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isFromMe ? "items-end" : "items-start"
                }`}
              >
                {/* Sender Name */}
                <span className="text-[10px] text-slate-400 px-1 mb-1 font-medium">
                  {isFromMe ? msg.senderName || "Вы (Менеджер)" : msg.senderName || conversation.contactName}
                </span>

                {/* Message Bubble Container */}
                <div
                  className={`relative max-w-sm sm:max-w-md md:max-w-lg rounded-2xl p-2.5 shadow-xs transition-shadow ${
                    isFromMe
                      ? "bg-emerald-600 text-white rounded-tr-none"
                      : "bg-white text-slate-900 rounded-tl-none border border-slate-200"
                  }`}
                >
                  {/* 1. TEXT MESSAGE */}
                  {msg.messageType === WhatsappMessageType.TEXT && (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                      {msg.textContent}
                    </p>
                  )}

                  {/* 2. AUDIO / VOICE MESSAGE */}
                  {msg.messageType === WhatsappMessageType.AUDIO && (
                    <div className="space-y-1">
                      <VoiceMessagePlayer
                        mediaUrl={msg.mediaUrl || ""}
                        fromMe={isFromMe}
                      />
                      {msg.textContent && msg.textContent !== "Голосовое сообщение" && (
                        <p className={`text-xs mt-1 px-1 ${isFromMe ? "text-emerald-100" : "text-slate-600"}`}>
                          {msg.textContent}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 3. IMAGE MESSAGE */}
                  {msg.messageType === WhatsappMessageType.IMAGE && (
                    <div className="space-y-2">
                      <div
                        onClick={() => setSelectedImage(msg.mediaUrl || null)}
                        className="relative rounded-xl overflow-hidden cursor-pointer group bg-slate-100 border border-black/5"
                      >
                        <img
                          src={msg.mediaUrl || ""}
                          alt="Вложение"
                          className="max-h-64 w-auto rounded-xl object-cover hover:scale-102 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Maximize2 className="w-5 h-5 drop-shadow" />
                        </div>
                      </div>
                      {msg.textContent && (
                        <p className={`text-xs ${isFromMe ? "text-emerald-50" : "text-slate-700"}`}>
                          {msg.textContent}
                        </p>
                      )}
                    </div>
                  )}

                  {/* 4. DOCUMENT (PDF) MESSAGE */}
                  {msg.messageType === WhatsappMessageType.DOCUMENT && (
                    <div className="space-y-2">
                      <div
                        className={`p-2.5 rounded-xl flex items-center gap-3 border ${
                          isFromMe
                            ? "bg-emerald-700/60 border-emerald-500 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-800"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">
                            {msg.fileName || "Документ.pdf"}
                          </div>
                          <div
                            className={`text-[10px] ${
                              isFromMe ? "text-emerald-200" : "text-slate-400"
                            }`}
                          >
                            PDF Документ
                          </div>
                        </div>

                        {msg.mediaUrl && (
                          <a
                            href={msg.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-2 rounded-lg transition-colors cursor-pointer ${
                              isFromMe
                                ? "hover:bg-emerald-500/50 text-white"
                                : "hover:bg-slate-200 text-slate-600"
                            }`}
                            title="Открыть / Скачать"
                          >
                            <Download className="w-4 h-4" />
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

                  {/* Bubble Footer: Timestamp & Delivery Tick */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                      isFromMe ? "text-emerald-200" : "text-slate-400"
                    }`}
                  >
                    <span>{formatMessageTime(msg.timestamp)}</span>
                    {isFromMe && <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Fullscreen Image Lightbox Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
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
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
