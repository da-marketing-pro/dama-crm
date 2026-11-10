"use client";

import { useState } from "react";
import { ChatConversation } from "../types";
import {
  Search,
  MessageCircle,
  FileText,
  Image as ImageIcon,
  Mic,
  Briefcase,
  Check,
  CheckCheck,
} from "lucide-react";
import { WhatsappMessageType } from "@prisma/client";

interface ChatListProps {
  conversations: ChatConversation[];
  activeRemoteJid: string | null;
  onSelectConversation: (remoteJid: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export function ChatList({
  conversations,
  activeRemoteJid,
  onSelectConversation,
  searchQuery,
  setSearchQuery,
}: ChatListProps) {
  const [filterType, setFilterType] = useState<"all" | "deals" | "nodeals">("all");

  const filtered = conversations.filter((c) => {
    // Search query matching
    const matchesQuery =
      c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contactPhone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.lastMessage.textContent &&
        c.lastMessage.textContent.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesQuery) return false;

    if (filterType === "deals") return !!c.deal;
    if (filterType === "nodeals") return !c.deal;
    return true;
  });

  const formatMessageSnippet = (conv: ChatConversation) => {
    const { lastMessage } = conv;
    if (lastMessage.messageType === WhatsappMessageType.AUDIO) {
      return (
        <span className="flex items-center gap-1 text-blue-600 font-medium">
          <Mic className="w-3 h-3" />
          <span>Голосовое сообщение</span>
        </span>
      );
    }
    if (lastMessage.messageType === WhatsappMessageType.IMAGE) {
      return (
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <ImageIcon className="w-3 h-3" />
          <span>Фотография</span>
        </span>
      );
    }
    if (lastMessage.messageType === WhatsappMessageType.DOCUMENT) {
      return (
        <span className="flex items-center gap-1 text-amber-600 font-medium">
          <FileText className="w-3 h-3" />
          <span>Документ (PDF)</span>
        </span>
      );
    }
    return lastMessage.textContent || "Вложение";
  };

  const formatTime = (isoString: Date | string) => {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  return (
    <div className="w-80 md:w-88 border-r border-slate-200 bg-white flex flex-col h-full shrink-0">
      {/* Search Header */}
      <div className="p-3.5 border-b border-slate-100 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск диалогов или сообщений..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-slate-600 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`flex-1 py-1 rounded-md text-center transition-all cursor-pointer ${
              filterType === "all" ? "bg-white text-slate-900 shadow-xs font-semibold" : "hover:text-slate-900"
            }`}
          >
            Все ({conversations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("deals")}
            className={`flex-1 py-1 rounded-md text-center transition-all cursor-pointer ${
              filterType === "deals" ? "bg-white text-slate-900 shadow-xs font-semibold" : "hover:text-slate-900"
            }`}
          >
            Со сделкой
          </button>
          <button
            type="button"
            onClick={() => setFilterType("nodeals")}
            className={`flex-1 py-1 rounded-md text-center transition-all cursor-pointer ${
              filterType === "nodeals" ? "bg-white text-slate-900 shadow-xs font-semibold" : "hover:text-slate-900"
            }`}
          >
            Без сделки
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <MessageCircle className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs">Диалоги не найдены</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = activeRemoteJid === conv.remoteJid;
            return (
              <button
                key={conv.remoteJid}
                type="button"
                onClick={() => onSelectConversation(conv.remoteJid)}
                className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                  isActive
                    ? "bg-emerald-50/80 border-r-4 border-r-emerald-600"
                    : "hover:bg-slate-50/80"
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-xs ${
                      isActive
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    {conv.contactName.slice(0, 2)}
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white absolute bottom-0 right-0" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span
                      className={`text-xs font-bold truncate ${
                        isActive ? "text-emerald-950" : "text-slate-900"
                      }`}
                    >
                      {conv.contactName}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                      {formatTime(conv.lastMessage.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1.5">
                    {conv.lastMessage.fromMe && (
                      <CheckCheck className="w-3 h-3 text-blue-500 shrink-0" />
                    )}
                    <div className="truncate">{formatMessageSnippet(conv)}</div>
                  </div>

                  {/* Deal Badge (AmoCRM style) */}
                  {conv.deal ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate max-w-[170px]"
                        style={{ backgroundColor: conv.deal.stageColor }}
                      >
                        <Briefcase className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{conv.deal.stageName}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {conv.deal.totalBudget.toLocaleString("ru-RU")} {conv.deal.currency === "KZT" ? "₸" : conv.deal.currency === "USD" ? "$" : "₽"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">Сделка не создана</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
