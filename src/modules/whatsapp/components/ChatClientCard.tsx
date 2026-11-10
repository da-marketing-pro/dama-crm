"use client";

import { useState } from "react";
import { ChatConversation } from "../types";
import {
  User,
  Phone,
  Building,
  Briefcase,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Tag,
  CheckCircle,
} from "lucide-react";
import { updateDealStageFromChat } from "../actions";

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

interface ChatClientCardProps {
  conversation: ChatConversation;
  pipelines: PipelineOption[];
  onOpenContact?: () => void;
  onOpenDeal?: () => void;
  onDealStageChanged?: () => void;
}

export function ChatClientCard({
  conversation,
  pipelines,
  onOpenContact,
  onOpenDeal,
  onDealStageChanged,
}: ChatClientCardProps) {
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);

  const deal = conversation.deal;

  // Find all stages across pipelines
  const currentPipeline = pipelines.find((p) => p.id === deal?.pipelineId) || pipelines[0];
  const availableStages = currentPipeline?.stages || [];

  const handleStageChange = async (newStageId: string) => {
    if (!deal || deal.stageId === newStageId || isUpdatingStage) return;

    setIsUpdatingStage(true);
    const res = await updateDealStageFromChat(deal.id, newStageId);
    setIsUpdatingStage(false);

    if (res.success && onDealStageChanged) {
      onDealStageChanged();
    }
  };

  return (
    <div className="w-72 lg:w-80 border-l border-slate-200 bg-white flex flex-col h-full shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Карточка лида
        </h3>
        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
          DAMA CRM
        </span>
      </div>

      <div className="p-4 space-y-6">
        {/* Contact Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-base shadow-sm">
              {conversation.contactName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-slate-900 truncate">
                {conversation.contactName}
              </h4>
              <p className="text-xs text-slate-500 font-mono">
                {conversation.contactPhone}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
            {conversation.company && (
              <div className="flex items-center gap-2 text-slate-600">
                <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{conversation.company}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-600">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-mono">{conversation.contactPhone}</span>
            </div>
          </div>

          {conversation.contactId && onOpenContact && (
            <button
              type="button"
              onClick={onOpenContact}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Открыть карточку контакта</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>

        {/* Deal Section */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold text-slate-900">Сделка клиента</h4>
            </div>
            {deal && (
              <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                {deal.totalBudget.toLocaleString("ru-RU")} {deal.currency === "KZT" ? "₸" : deal.currency === "USD" ? "$" : "₽"}
              </span>
            )}
          </div>

          {deal ? (
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-900 line-clamp-2">
                  {deal.title}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Воронка: {currentPipeline?.name || "Основная"}
                </div>
              </div>

              {/* Stage selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Этап сделки
                </label>
                <select
                  value={deal.stageId}
                  onChange={(e) => handleStageChange(e.target.value)}
                  disabled={isUpdatingStage}
                  className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer transition-all"
                  style={{
                    backgroundColor: `${deal.stageColor}15`,
                    color: deal.stageColor,
                    borderColor: `${deal.stageColor}40`,
                  }}
                >
                  {availableStages.map((st) => (
                    <option key={st.id} value={st.id} className="text-slate-900 bg-white">
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              {onOpenDeal && (
                <button
                  type="button"
                  onClick={onOpenDeal}
                  className="w-full py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Перейти к сделке</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
              <p className="text-xs text-slate-500">
                К этому контакту еще не привязана сделка
              </p>
              {conversation.contactId && onOpenContact && (
                <button
                  type="button"
                  onClick={onOpenContact}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  + Создать сделку
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick Tips */}
        <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-[11px] text-emerald-900 space-y-1">
          <div className="font-bold flex items-center gap-1 text-emerald-800">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Авто-синхронизация</span>
          </div>
          <p className="leading-relaxed text-emerald-800/80">
            Каждое входящее и исходящее сообщение мгновенно фиксируется в таймлайне клиента.
          </p>
        </div>
      </div>
    </div>
  );
}
