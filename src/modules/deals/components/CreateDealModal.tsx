"use client";

import { useState, useEffect } from "react";
import { searchContactByPhone, createDeal } from "../actions";
import { buildDealSourceOptions } from "@/lib/dealSource";
import { Currency } from "@prisma/client";
import {
  X,
  Plus,
  Phone,
  User,
  Building,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Briefcase,
} from "lucide-react";

interface PipelineInfo {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    color: string;
    type: any;
  }[];
}

interface CreateDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelines: PipelineInfo[];
  defaultPipelineId?: string;
  defaultStageId?: string;
  users: { id: string; name: string }[];
  currentUserId: string;
  sourceOptions?: string[];
  onCreated?: (dealId: string) => void;
}

export function CreateDealModal({
  isOpen,
  onClose,
  pipelines,
  defaultPipelineId,
  defaultStageId,
  users,
  currentUserId,
  sourceOptions,
  onCreated,
}: CreateDealModalProps) {
  const [title, setTitle] = useState("");
  const [pipelineId, setPipelineId] = useState(defaultPipelineId || pipelines[0]?.id || "");
  const [stageId, setStageId] = useState(
    defaultStageId ||
      pipelines.find((p) => p.id === (defaultPipelineId || pipelines[0]?.id))?.stages[0]?.id ||
      ""
  );
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState<Currency>(Currency.KZT);
  const [source, setSource] = useState("");
  const [assignedToId, setAssignedToId] = useState(currentUserId);

  // Sync state when modal opens or target pipeline/stage changes
  useEffect(() => {
    if (isOpen) {
      const activePipe =
        pipelines.find((p) => p.id === (defaultPipelineId || pipelineId)) || pipelines[0];
      if (activePipe) {
        setPipelineId(activePipe.id);
        if (defaultStageId && activePipe.stages.some((s) => s.id === defaultStageId)) {
          setStageId(defaultStageId);
        } else {
          setStageId(activePipe.stages[0]?.id || "");
        }
      }
      setError(null);
    }
  }, [isOpen, defaultPipelineId, defaultStageId, pipelines]);

  // Contact fields & duplicate search
  const [contactPhone, setContactPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [foundContact, setFoundContact] = useState<{
    id: string;
    name: string;
    phone: string;
    company: string | null;
  } | null>(null);
  const [isSearchingPhone, setIsSearchingPhone] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update stages when pipeline changes
  const handlePipelineChange = (pId: string) => {
    setPipelineId(pId);
    const p = pipelines.find((pipe) => pipe.id === pId);
    if (p && p.stages.length > 0) {
      setStageId(p.stages[0].id);
    }
  };

  // Debounced search by phone
  useEffect(() => {
    const timer = setTimeout(async () => {
      const clean = contactPhone.trim();
      if (clean.length >= 6) {
        setIsSearchingPhone(true);
        const match = await searchContactByPhone(clean);
        setIsSearchingPhone(false);
        if (match) {
          setFoundContact(match);
          if (!contactName) setContactName(match.name);
          if (!contactCompany && match.company) setContactCompany(match.company);
        } else {
          setFoundContact(null);
        }
      } else {
        setFoundContact(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [contactPhone]);

  if (!isOpen) return null;

  const currentPipeline = pipelines.find((p) => p.id === pipelineId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await createDeal({
      title,
      pipelineId,
      stageId,
      totalBudget: parseFloat(budget) || 0,
      currency,
      source: source || undefined,
      assignedToId,
      contactId: foundContact?.id,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactCompany: contactCompany.trim() || undefined,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error || "Ошибка создания сделки");
    } else {
      setTitle("");
      setBudget("");
      setContactPhone("");
      setContactName("");
      setContactCompany("");
      setFoundContact(null);
      setSource("");
      if (onCreated && res.dealId) onCreated(res.dealId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Новая сделка</h3>
              <p className="text-xs text-slate-500">
                Создание сделки с умной проверкой дублей контакта
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Deal Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Название сделки *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Внедрение CRM под ключ"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Pipeline & Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Воронка продаж *
              </label>
              <select
                value={pipelineId}
                onChange={(e) => handlePipelineChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Этап сделки *
              </label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                {currentPipeline?.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Budget & Currency & Responsible */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Плановый бюджет
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="1000000"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Валюта сделки
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="KZT">KZT — Тенге (₸)</option>
                <option value="USD">USD — Доллар ($)</option>
                <option value="RUB">RUB — Рубль (₽)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ответственный
              </label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lead Source */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Источник лида
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="">Не указан</option>
              {buildDealSourceOptions(sourceOptions).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Smart Contact Check Section */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Контакт клиента
              </span>
              {isSearchingPhone && (
                <span className="text-[11px] text-blue-600 animate-pulse">
                  Поиск в базе клиентов...
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Номер телефона клиента *
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+7 (701) 000-00-00"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Smart Matching Feedback Banner */}
            {foundContact ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Найден существующий контакт в базе:</span>
                </div>
                <div className="pl-5 text-emerald-800 font-medium">
                  {foundContact.name}{" "}
                  {foundContact.company && `(${foundContact.company})`} — {foundContact.phone}
                </div>
                <p className="pl-5 text-[11px] text-emerald-700">
                  Сделка будет автоматически привязана к этому клиенту.
                </p>
              </div>
            ) : contactPhone.trim().length >= 6 ? (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-900">
                  <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Контакт не найден в базе CRM</span>
                </div>
                <p className="text-[11px] text-blue-700">
                  При создании сделки система автоматически зарегистрирует нового клиента в базе контактов.
                </p>
              </div>
            ) : null}

            {/* Contact Name & Company inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Имя / ФИО контакта *
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Алибек Сарсенов"
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Компания / Организация
                </label>
                <div className="relative">
                  <Building className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={contactCompany}
                    onChange={(e) => setContactCompany(e.target.value)}
                    placeholder="ТОО или бренд"
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Сохранение..." : "Создать сделку"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
