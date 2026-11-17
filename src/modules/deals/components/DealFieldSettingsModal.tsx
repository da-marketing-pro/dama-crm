"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { DealCustomFieldDef } from "../types";
import {
  createDealFieldDefinitionAction,
  deleteDealFieldDefinitionAction,
  updateDealFieldDefinitionAction,
  reorderDealFieldDefinitionsAction,
} from "../actions";
import {
  X,
  GripVertical,
  Plus,
  Trash2,
  Users,
  Check,
  AlertCircle,
  Briefcase,
  Edit2,
  ChevronUp,
  ChevronDown,
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
  const [mounted, setMounted] = useState(false);

  // Local state for instant UI reordering
  const [localDealFields, setLocalDealFields] = useState<DealCustomFieldDef[]>(dealFields);
  const [localContactFields, setLocalContactFields] = useState<DealCustomFieldDef[]>(contactFields);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalDealFields(dealFields);
  }, [dealFields]);

  useEffect(() => {
    setLocalContactFields(contactFields);
  }, [contactFields]);

  // Inline "Add Field" state
  const [addingTarget, setAddingTarget] = useState<"DEAL" | "CONTACT" | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"TEXT" | "NUMBER" | "DATE" | "SELECT">("TEXT");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state for an existing field
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"TEXT" | "NUMBER" | "DATE" | "SELECT">("TEXT");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [newOptionInput, setNewOptionInput] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  if (!isOpen) return null;

  const handleStartEdit = (field: DealCustomFieldDef) => {
    setEditingFieldId(field.id);
    setEditName(field.name);
    setEditType(field.fieldType);
    setEditOptions(field.options ? [...field.options] : []);
    setNewOptionInput("");
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingFieldId(null);
    setEditName("");
    setEditOptions([]);
    setNewOptionInput("");
  };

  const handleAddOptionToEdit = () => {
    const trimmed = newOptionInput.trim();
    if (!trimmed) return;
    if (!editOptions.includes(trimmed)) {
      setEditOptions([...editOptions, trimmed]);
    }
    setNewOptionInput("");
  };

  const handleRemoveOptionFromEdit = (index: number) => {
    setEditOptions(editOptions.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!editingFieldId || !editName.trim()) return;
    setIsSavingEdit(true);
    setError(null);

    const res = await updateDealFieldDefinitionAction(editingFieldId, {
      name: editName.trim(),
      fieldType: editType,
      options: editType === "SELECT" ? editOptions : [],
    });

    setIsSavingEdit(false);
    if (!res.success) {
      setError(res.error || "Ошибка сохранения поля");
    } else {
      setEditingFieldId(null);
      onFieldsChanged();
    }
  };

  const handleMoveField = async (target: "DEAL" | "CONTACT", index: number, direction: "UP" | "DOWN") => {
    if (!isAdmin) return;
    const list = target === "DEAL" ? [...localDealFields] : [...localContactFields];
    const targetIndex = direction === "UP" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    // Swap
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    if (target === "DEAL") {
      setLocalDealFields(list);
    } else {
      setLocalContactFields(list);
    }

    const orderedIds = list.map((f) => f.id);
    const res = await reorderDealFieldDefinitionsAction(orderedIds);
    if (!res.success) {
      setError(res.error || "Не удалось изменить порядок");
    } else {
      onFieldsChanged();
    }
  };

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
    if (!confirm(`Удалить поле «${fieldName}»? Данные этого поля перестанут отображаться в карточке.`)) return;

    const res = await deleteDealFieldDefinitionAction(fieldId);
    if (!res.success) {
      setError(res.error || "Ошибка удаления поля");
    } else {
      if (editingFieldId === fieldId) {
        setEditingFieldId(null);
      }
      onFieldsChanged();
    }
  };

  // Base read-only system columns that are part of Deal model directly
  const baseDealFields = [
    { name: "Бюджет сделки", badge: "₸ Базовое", note: "Основная сумма сделки" },
  ];

  const baseContactFields = [
    { name: "Имя контакта", badge: "Текст (Базовое)" },
    { name: "Телефон", badge: "Телефон (Базовое)" },
    { name: "Email", badge: "Email (Базовое)" },
    { name: "Компания", badge: "Текст (Базовое)" },
  ];

  const modalContent = (
    <div className="fixed inset-0 z-[100] overflow-hidden flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity duration-200"
      />

      {/* Modal Card - amoCRM exact dark style */}
      <div className="relative w-full max-w-2xl bg-[#0f1d2b] border border-[#223c56] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-[#1d354d] flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Настройка полей карточки сделки
            </h2>
            <p className="text-xs text-[#7e9bb5] mt-0.5">
              Вы можете менять порядок полей кнопками ▲/▼, редактировать названия и списки вариантов, а также удалять лишние поля.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1d354d] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Groups / Tabs Bar (amoCRM style tabs) */}
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
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-rose-400 hover:text-rose-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
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
                {baseDealFields.length + localDealFields.length} полей
              </span>
            </div>

            {/* Fields container */}
            <div className="space-y-2">
              {/* Core / base field: Бюджет сделки */}
              {baseDealFields.map((f) => (
                <div
                  key={f.name}
                  className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Layers className="w-3.5 h-3.5 text-[#486e92] shrink-0" />
                    <span className="font-semibold text-slate-300 truncate">{f.name}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668] shrink-0">
                    {f.badge}
                  </span>
                </div>
              ))}

              {/* Dynamic Reorderable & Editable Deal fields */}
              {localDealFields.map((f, idx) => {
                const isEditing = editingFieldId === f.id;

                if (isEditing) {
                  return (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-xl bg-[#162b42] border border-[#2e70e9] space-y-3 shadow-lg"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>Редактирование поля: {f.name}</span>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] text-[#7e9bb5] block mb-1">
                            Название поля *
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-[#7e9bb5] block mb-1">
                            Тип поля
                          </label>
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as any)}
                            className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                          >
                            <option value="SELECT">Список (выпадающий список)</option>
                            <option value="TEXT">Текст (строка)</option>
                            <option value="NUMBER">Число</option>
                            <option value="DATE">Дата (календарь)</option>
                          </select>
                        </div>
                      </div>

                      {/* If SELECT: Options editor with add & delete chips */}
                      {editType === "SELECT" && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-[#7e9bb5] block">
                            Варианты выпадающего списка ({editOptions.length})
                          </label>

                          {/* Existing options pills */}
                          <div className="flex flex-wrap gap-1.5 p-2 bg-[#0f1d2b] border border-[#223c56] rounded-lg min-h-[38px] max-h-36 overflow-y-auto">
                            {editOptions.length === 0 ? (
                              <span className="text-[11px] text-slate-500 italic">
                                Нет вариантов. Добавьте первый вариант ниже.
                              </span>
                            ) : (
                              editOptions.map((opt, optIdx) => (
                                <span
                                  key={optIdx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#19334d] text-blue-200 border border-[#2e5a85] text-xs font-medium"
                                >
                                  <span>{opt}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOptionFromEdit(optIdx)}
                                    className="text-slate-400 hover:text-rose-400 p-0.5"
                                    title="Удалить вариант"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>

                          {/* Add option input */}
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="Новый пункт (например: Лид)"
                              value={newOptionInput}
                              onChange={(e) => setNewOptionInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddOptionToEdit();
                                }
                              }}
                              className="flex-1 px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-[#2e70e9]"
                            />
                            <button
                              type="button"
                              onClick={handleAddOptionToEdit}
                              className="px-3 py-1.5 rounded-lg bg-[#1f3e60] hover:bg-[#28507c] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Добавить</span>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#223c56]">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          disabled={isSavingEdit || !editName.trim()}
                          onClick={handleSaveEdit}
                          className="px-3.5 py-1.5 rounded-lg bg-[#2e70e9] hover:bg-[#255ec4] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSavingEdit ? "Сохранение..." : "Сохранить"}</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={f.id}
                    className="px-3.5 py-2.5 rounded-xl bg-[#14283c] border border-[#22405e] hover:border-blue-500/50 flex items-center justify-between gap-3 text-xs text-slate-200 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Reorder Up / Down Buttons */}
                      {isAdmin && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveField("DEAL", idx, "UP")}
                            className="p-0.5 rounded text-slate-400 hover:text-blue-300 disabled:opacity-20 hover:bg-[#1a3550] cursor-pointer"
                            title="Переместить вверх"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === localDealFields.length - 1}
                            onClick={() => handleMoveField("DEAL", idx, "DOWN")}
                            className="p-0.5 rounded text-slate-400 hover:text-blue-300 disabled:opacity-20 hover:bg-[#1a3550] cursor-pointer"
                            title="Переместить вниз"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <span className="font-semibold text-white truncate">{f.name}</span>
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

                      {/* Edit Button */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(f)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-300 hover:bg-[#1f3c5b] transition-colors cursor-pointer"
                          title="Редактировать поле и варианты"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete Button */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteField(f.id, f.name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Удалить поле"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
                      placeholder="Лид, Новый клиент, Повторный клиент"
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
                  setEditingFieldId(null);
                }}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#244668] hover:border-[#2e70e9] hover:bg-[#132537] text-xs font-semibold text-[#6891b8] hover:text-[#2e70e9] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить поле сделки</span>
              </button>
            )}
          </div>

          {/* Section 2: Поля контактов */}
          <div className="space-y-2.5 pt-3 border-t border-[#1d354d]">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7e9bb5] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#10b981]" />
                Поля контактов
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                {baseContactFields.length + localContactFields.length} полей
              </span>
            </div>

            <div className="space-y-2">
              {baseContactFields.map((f) => (
                <div
                  key={f.name}
                  className="px-3.5 py-2.5 rounded-xl bg-[#132537] border border-[#1e3954] flex items-center justify-between gap-3 text-xs text-slate-200"
                >
                  <span className="font-medium text-slate-300 truncate">{f.name}</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                    {f.badge}
                  </span>
                </div>
              ))}

              {localContactFields.map((f, idx) => {
                const isEditing = editingFieldId === f.id;

                if (isEditing) {
                  return (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-xl bg-[#162b42] border border-emerald-500/70 space-y-3 shadow-lg"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>Редактирование поля контакта: {f.name}</span>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] text-[#7e9bb5] block mb-1">
                            Название поля *
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-[#7e9bb5] block mb-1">
                            Тип поля
                          </label>
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as any)}
                            className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                          >
                            <option value="TEXT">Текст (строка)</option>
                            <option value="NUMBER">Число</option>
                            <option value="DATE">Дата (календарь)</option>
                            <option value="SELECT">Список (выпадающий список)</option>
                          </select>
                        </div>
                      </div>

                      {editType === "SELECT" && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-[#7e9bb5] block">
                            Варианты выпадающего списка ({editOptions.length})
                          </label>
                          <div className="flex flex-wrap gap-1.5 p-2 bg-[#0f1d2b] border border-[#223c56] rounded-lg min-h-[38px] max-h-36 overflow-y-auto">
                            {editOptions.length === 0 ? (
                              <span className="text-[11px] text-slate-500 italic">
                                Нет вариантов. Добавьте пункт ниже.
                              </span>
                            ) : (
                              editOptions.map((opt, optIdx) => (
                                <span
                                  key={optIdx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#19334d] text-emerald-200 border border-emerald-700/60 text-xs font-medium"
                                >
                                  <span>{opt}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveOptionFromEdit(optIdx)}
                                    className="text-slate-400 hover:text-rose-400 p-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="Новый пункт..."
                              value={newOptionInput}
                              onChange={(e) => setNewOptionInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddOptionToEdit();
                                }
                              }}
                              className="flex-1 px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={handleAddOptionToEdit}
                              className="px-3 py-1.5 rounded-lg bg-[#1f3e60] hover:bg-[#28507c] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Добавить</span>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#223c56]">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          disabled={isSavingEdit || !editName.trim()}
                          onClick={handleSaveEdit}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSavingEdit ? "Сохранение..." : "Сохранить"}</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={f.id}
                    className="px-3.5 py-2.5 rounded-xl bg-[#14283c] border border-emerald-500/30 flex items-center justify-between gap-3 text-xs text-slate-200"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isAdmin && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveField("CONTACT", idx, "UP")}
                            className="p-0.5 rounded text-slate-400 hover:text-emerald-300 disabled:opacity-20 hover:bg-[#1a3550] cursor-pointer"
                            title="Переместить вверх"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === localContactFields.length - 1}
                            onClick={() => handleMoveField("CONTACT", idx, "DOWN")}
                            className="p-0.5 rounded text-slate-400 hover:text-emerald-300 disabled:opacity-20 hover:bg-[#1a3550] cursor-pointer"
                            title="Переместить вниз"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <span className="font-semibold text-white truncate">{f.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#19324a] text-[#86a8c7] text-[11px] font-mono border border-[#244668]">
                        {f.fieldType === "SELECT" ? "Список" : f.fieldType === "DATE" ? "Дата" : "Текст"}
                      </span>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(f)}
                          className="p-1.5 rounded text-slate-400 hover:text-emerald-300 hover:bg-[#1f3c5b] transition-colors cursor-pointer"
                          title="Редактировать поле"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

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
                );
              })}
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
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#7e9bb5] block mb-1">Тип поля</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-[#0f1d2b] border border-[#223c56] rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="TEXT">Текст (строка)</option>
                      <option value="NUMBER">Число</option>
                      <option value="DATE">Дата (календарь)</option>
                      <option value="SELECT">Список</option>
                    </select>
                  </div>
                </div>

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
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isSubmitting ? "Сохранение..." : "Сохранить"}
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
                  setEditingFieldId(null);
                }}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#244668] hover:border-emerald-500 hover:bg-[#132537] text-xs font-semibold text-[#6891b8] hover:text-emerald-400 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить поле контакта</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#0b1723] border-t border-[#1d354d] flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px]">
            Изменения вступают в силу немедленно для всех карточек.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#2e70e9] hover:bg-[#255ec4] text-white font-semibold cursor-pointer shadow-sm transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modalContent, document.body);
}
