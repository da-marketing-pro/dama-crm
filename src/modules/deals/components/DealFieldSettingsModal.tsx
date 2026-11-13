"use client";

import { useState } from "react";
import { DealCustomFieldDef } from "../types";
import {
  createDealFieldDefinitionAction,
  deleteDealFieldDefinitionAction,
} from "../actions";
import {
  X,
  GripVertical,
  Plus,
  Trash2,
  Users,
  Building2,
  Check,
  AlertCircle,
  Briefcase,
  Layers,
} from "lucide-react";

interface DealFieldSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealFields: DealCustomFieldDef[];
  contactFields: DealCustomFieldDef[];
  isAdmin: boolean;
  onFieldsChanged: () => void;
}

export function DealFieldSettingsModal({
  isOpen,
  onClose,
  dealFields,
  contactFields,
  isAdmin,
  onFieldsChanged,
}: DealFieldSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "stats" | "files">("general");

  // Inline "Add Field" state
  const [addingTarget, setAddingTarget] = useState<"DEAL" | "CONTACT" | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"TEXT" | "NUMBER" | "DATE" | "SELECT">("TEXT");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim() || !addingTarget) return;

    setIsSubmitting(true);
    setError(null);

    const optionsArray =
      newFieldType === "SELECT"
        ? newFieldOptions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const res = await createDealFieldDefinitionAction({
      entityType: addingTarget,
      name: newFieldName.trim(),
      fieldType: newFieldType,
      options: optionsArray,
    });

    setIsSubmitting(false);
    if (!res.success) {
      setError(res.error || "Ошибка создания поля");
    } else {
      setNewFieldName("");
      setNewFieldOptions("");
      setNewFieldType("TEXT");
      setAddingTarget(null);
      onFieldsChanged();
    }
  };

  const handleDeleteField = async (fieldId: string, fieldName: string) => {
    if (!isAdmin) return;
    if (!confirm(`Удалить поле «${fieldName}»? Данные этого поля перестанут отображаться.`)) return;

    const res = await deleteDealFieldDefinitionAction(fieldId);
    if (!res.success) {
      alert(res.error || "Ошибка удаления поля");
    } else {
      onFieldsChanged();
    }
  };

  // Standard static amoCRM fields
  const standardDealFields = [
    { name: "Бюджет сделки", badge: "₸0", standard: true },
    { name: "Тип маркетинга", badge: "6 вариантов", standard: true },
    { name: "Дата запуска кампании", badge: "Дата", standard: true },
    { name: "Бюджет кампании", badge: "Число", standard: true },
    { name: "Тип клиента", badge: "3 варианта", standard: true },
    { name: "Требуется согласование", badge: "Чекбокс", standard: true },
    { name: "Комментарии менеджера", badge: "Текст", standard: true },
    { name: "Источник", badge: "Список", standard: true },
  ];

  const standardContactFields = [
    { name: "Имя контакта", badge: "Текст" },
    { name: "Телефон", badge: "Телефон" },
    { name: "Email", badge: "Email" },
    { name: "Должность", badge: "Текст" },
  ];

  const standardCompanyFields = [
    { name: "Название компании", badge: "Текст" },
    { name: "Телефон компании", badge: "Телефон" },
    { name: "Email компании", badge: "Email" },
  ];

  // Distinguish custom from standard
  const standardDealFieldNames = new Set(standardDealFields.map((f) => f.name.toLowerCase()));
  const customDealFields = dealFields.filter(
    (f) => !standardDealFieldNames.has(f.name.toLowerCase())
  );

  const standardContactFieldNames = new Set(standardContactFields.map((f) => f.name.toLowerCase()));
  const customContactFields = contactFields.filter(
    (f) => !standardContactFieldNames.has(f.name.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-60 overflow-hidden flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
      />

      {/* Modal Card - amoCRM exact dark style */}
      <div className="relative w-full max-w-2xl bg-[#0f1d2b] border border-[#223c56] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-[#1d354d] flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Настройка свойств полей и групп
            </h2>
            <p className="text-xs text-[#7e9bb5] mt-0.5">
              В DAMA CRM вы можете добавлять свои уникальные поля и использовать их для любых фильтров и отчетов.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1d354d] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Groups / Tabs Bar (amoCRM style tabs: :: Основное, :: Статистика, :: Файлы) */}
        <div className="px-6 py-2.5 bg-[#0b1723] border-b border-[#1d354d] flex items-center gap-2 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "general"
                ? "bg-[#1f3b57] text-white border border-[#2e5a85] shadow-xs"
                : "text-[#7e9bb5] hover:text-white hover:bg-[#152738]"
            }`}
          >
            <GripVertical className="w-3.5 h-3.5 text-[#52779a]" />
            <span>Основное</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "stats"
                ? "bg-[#1f3b57] text-white border border-[#2e5a85] shadow-xs"
                : "text-[#7e9bb5] hover:text-white hover:bg-[#152738]"
            }`}
          >
            <GripVertical className="w-3.5 h-3.5 text-[#52779a]" />
            <span>Статистика</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "files"
                ? "bg-[#1f3b57] text-white border border-[#2e5a85] shadow-xs"
                : "text-[#7e9bb5] hover:text-white hover:bg-[#152738]"
            }`}
          >
            <GripVertical className="w-3.5 h-3.5 text-[#52779a]" />
            <span>Файлы</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Поля сделки (Основное) */}
          <div className="space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7e9bb5] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[#3b82f6]" />
                Поля сделки (Группа «Основное»)
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                {standardDealFields.length + customDealFields.length} полей
              </span>
            </div>

            {/* Fields container */}
            <div className="space-y-1.5">
              {/* Standard fields */}
              {standardDealFields.map((f) => (
                <div
                  key={f.name}
                  className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200 hover:border-[#2b5177] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GripVertical className="w-3.5 h-3.5 text-[#486e92] shrink-0" />
                    <span className="font-medium truncate">{f.name}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668] shrink-0">
                    {f.badge}
                  </span>
                </div>
              ))}

              {/* Custom fields */}
              {customDealFields.map((f) => (
                <div
                  key={f.id}
                  className="px-3.5 py-2.5 rounded-xl bg-[#14283c] border border-blue-500/30 flex items-center justify-between gap-3 text-xs text-slate-200 hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GripVertical className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="font-semibold text-white truncate">{f.name}</span>
                    <span className="text-[10px] text-blue-300 font-mono bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-800/50">
                      своё поле
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                      {f.fieldType === "SELECT"
                        ? `${f.options?.length || 0} вар.`
                        : f.fieldType === "DATE"
                        ? "Дата"
                        : f.fieldType === "NUMBER"
                        ? "Число"
                        : "Текст"}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteField(f.id, f.name)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Удалить поле"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Field Button / Inline Form */}
            {addingTarget === "DEAL" ? (
              <form
                onSubmit={handleAddField}
                className="p-3.5 rounded-xl bg-[#162a3f] border border-[#2e5a85] space-y-3"
              >
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Новое поле для сделки</span>
                  <button
                    type="button"
                    onClick={() => setAddingTarget(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-[#7e9bb5] block mb-1">Название поля *</label>
                    <input
                      type="text"
                      required
                      placeholder="Например: Ссылка на бриф"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#7e9bb5] block mb-1">Тип поля</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                    >
                      <option value="TEXT">Текст (строка)</option>
                      <option value="NUMBER">Число</option>
                      <option value="DATE">Дата (календарь)</option>
                      <option value="SELECT">Список (варианты)</option>
                    </select>
                  </div>
                </div>

                {newFieldType === "SELECT" && (
                  <div>
                    <label className="text-[11px] text-[#7e9bb5] block mb-1">
                      Варианты выбора (через запятую)
                    </label>
                    <input
                      type="text"
                      placeholder="Вариант 1, Вариант 2, Вариант 3"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddingTarget(null)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newFieldName.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-[#2e70e9] hover:bg-[#255ec4] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isSubmitting ? "Сохранение..." : "Сохранить поле"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingTarget("DEAL");
                  setNewFieldName("");
                  setNewFieldOptions("");
                  setNewFieldType("TEXT");
                }}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#244668] hover:border-[#2e70e9] hover:bg-[#132537] text-xs font-semibold text-[#6891b8] hover:text-[#2e70e9] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить поле</span>
              </button>
            )}
          </div>

          {/* Section 2: Поля контактов */}
          <div className="space-y-2.5 pt-2 border-t border-[#1d354d]">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7e9bb5] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#10b981]" />
                Поля контактов
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                {standardContactFields.length + customContactFields.length} полей
              </span>
            </div>

            <div className="space-y-1.5">
              {standardContactFields.map((f) => (
                <div
                  key={f.name}
                  className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200"
                >
                  <span className="font-medium truncate">{f.name}</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                    {f.badge}
                  </span>
                </div>
              ))}

              {customContactFields.map((f) => (
                <div
                  key={f.id}
                  className="px-3.5 py-2.5 rounded-xl bg-[#14283c] border border-emerald-500/30 flex items-center justify-between gap-3 text-xs text-slate-200"
                >
                  <span className="font-semibold text-white truncate">{f.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                      {f.fieldType === "SELECT" ? "Список" : f.fieldType === "DATE" ? "Дата" : "Текст"}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteField(f.id, f.name)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Удалить поле"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {addingTarget === "CONTACT" ? (
              <form
                onSubmit={handleAddField}
                className="p-3.5 rounded-xl bg-[#162a3f] border border-[#2e5a85] space-y-3"
              >
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Новое поле для контакта</span>
                  <button
                    type="button"
                    onClick={() => setAddingTarget(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-[#7e9bb5] block mb-1">Название поля *</label>
                    <input
                      type="text"
                      required
                      placeholder="Например: Telegram username"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#7e9bb5] block mb-1">Тип поля</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                    >
                      <option value="TEXT">Текст (строка)</option>
                      <option value="NUMBER">Число</option>
                      <option value="DATE">Дата (календарь)</option>
                      <option value="SELECT">Список</option>
                    </select>
                  </div>
                </div>

                {newFieldType === "SELECT" && (
                  <div>
                    <label className="text-[11px] text-[#7e9bb5] block mb-1">
                      Варианты (через запятую)
                    </label>
                    <input
                      type="text"
                      placeholder="Вариант 1, Вариант 2"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddingTarget(null)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newFieldName.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-[#2e70e9] hover:bg-[#255ec4] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isSubmitting ? "Сохранение..." : "Сохранить поле"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingTarget("CONTACT");
                  setNewFieldName("");
                  setNewFieldOptions("");
                  setNewFieldType("TEXT");
                }}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#244668] hover:border-[#10b981] hover:bg-[#132537] text-xs font-semibold text-[#6891b8] hover:text-[#10b981] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить поле</span>
              </button>
            )}
          </div>

          {/* Section 3: Поля компаний */}
          <div className="space-y-2.5 pt-2 border-t border-[#1d354d]">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7e9bb5] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#f59e0b]" />
                Поля компаний
              </span>
            </div>

            <div className="space-y-1.5">
              {standardCompanyFields.map((f) => (
                <div
                  key={f.name}
                  className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200"
                >
                  <span className="font-medium truncate">{f.name}</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                    {f.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#0b1723] border-t border-[#1d354d] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#2e70e9] hover:bg-[#255ec4] text-white text-xs font-bold cursor-pointer shadow-md shadow-blue-500/20 transition-all"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
