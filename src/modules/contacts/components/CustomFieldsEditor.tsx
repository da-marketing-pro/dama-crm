"use client";

import { useState } from "react";
import { CustomFieldDef } from "../types";
import { createCustomFieldDefinition, deleteCustomFieldDefinition, updateContact } from "../actions";
import { FieldType } from "@prisma/client";
import { Settings2, Plus, Trash2, Check, AlertCircle, Save, SlidersHorizontal } from "lucide-react";

interface CustomFieldsEditorProps {
  contactId: string;
  initialValues: Record<string, any>;
  fieldDefs: CustomFieldDef[];
  isAdmin: boolean;
  canEdit: boolean;
  onSaved?: () => void;
}

export function CustomFieldsEditor({
  contactId,
  initialValues,
  fieldDefs,
  isAdmin,
  canEdit,
  onSaved,
}: CustomFieldsEditorProps) {
  const [values, setValues] = useState<Record<string, any>>(initialValues || {});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field Constructor State (Admin only)
  const [showConstructor, setShowConstructor] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("TEXT");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [isCreatingField, setIsCreatingField] = useState(false);

  const handleValueChange = (fieldName: string, val: any) => {
    setValues((prev) => ({
      ...prev,
      [fieldName]: val,
    }));
    setSaveSuccess(false);
  };

  const handleSaveValues = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    const res = await updateContact(contactId, {
      customFields: values,
    });

    setIsSaving(false);
    if (!res.success) {
      setError(res.error || "Не удалось сохранить значения");
    } else {
      setSaveSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // Admin: Create new custom field definition
  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newFieldName.trim()) return;

    setIsCreatingField(true);
    setError(null);

    let parsedOptions: string[] | undefined = undefined;
    if (newFieldType === "SELECT" && newFieldOptions.trim()) {
      parsedOptions = newFieldOptions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const res = await createCustomFieldDefinition({
      name: newFieldName.trim(),
      fieldType: newFieldType,
      options: parsedOptions,
      isRequired: newFieldRequired,
    });

    setIsCreatingField(false);
    if (!res.success) {
      setError(res.error || "Ошибка добавления поля");
    } else {
      setNewFieldName("");
      setNewFieldOptions("");
      setNewFieldRequired(false);
    }
  };

  // Admin: Delete custom field definition
  const handleDeleteField = async (fieldId: string, fieldName: string) => {
    if (!isAdmin) return;
    if (!confirm(`Удалить кастомное поле «${fieldName}» из системы?`)) return;

    setError(null);
    const res = await deleteCustomFieldDefinition(fieldId);
    if (!res.success) {
      setError(res.error || "Не удалось удалить поле");
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Title & Constructor trigger */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Кастомные поля
          </h4>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowConstructor(!showConstructor)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{showConstructor ? "Скрыть конструктор" : "Конструктор полей"}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Admin Field Constructor Panel */}
      {showConstructor && isAdmin && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-blue-200 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Добавить новое кастомное поле
            </span>
          </div>

          <form onSubmit={handleCreateField} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Название поля *</label>
                <input
                  type="text"
                  required
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="Например: Источник рекламы"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Тип поля</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium"
                >
                  <option value="TEXT">Текст (строка)</option>
                  <option value="NUMBER">Число</option>
                  <option value="DATE">Дата</option>
                  <option value="SELECT">Выпадающий список</option>
                </select>
              </div>
            </div>

            {newFieldType === "SELECT" && (
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Варианты выбора (через запятую)
                </label>
                <input
                  type="text"
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  placeholder="Instagram, Сайт, Рекомендация, Звонок"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFieldRequired}
                  onChange={(e) => setNewFieldRequired(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Обязательное для заполнения</span>
              </label>

              <button
                type="submit"
                disabled={isCreatingField || !newFieldName.trim()}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreatingField ? "Создание..." : "Добавить поле"}</span>
              </button>
            </div>
          </form>

          {/* List of existing definitions with delete buttons */}
          {fieldDefs.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
                Активные поля в контактах:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {fieldDefs.map((def) => (
                  <div
                    key={def.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] text-slate-700"
                  >
                    <span>{def.name}</span>
                    <span className="text-[9px] text-slate-400">({def.fieldType})</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteField(def.id, def.name)}
                      className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                      title="Удалить поле"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fields Values Form */}
      {fieldDefs.length === 0 ? (
        <div className="p-3 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
          Кастомные поля еще не созданы.
          {isAdmin && " Нажмите «Конструктор полей» выше, чтобы добавить."}
        </div>
      ) : (
        <div className="space-y-3">
          {fieldDefs.map((field) => {
            let options: string[] = [];
            if (field.fieldType === "SELECT") {
              try {
                options = Array.isArray(field.options)
                  ? field.options
                  : JSON.parse(field.options || "[]");
              } catch {
                options = [];
              }
            }

            const currentVal = values[field.name] ?? "";

            return (
              <div key={field.id} className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  {field.name} {field.isRequired && <span className="text-rose-500">*</span>}
                </label>

                {field.fieldType === "SELECT" ? (
                  <select
                    disabled={!canEdit}
                    value={currentVal}
                    onChange={(e) => handleValueChange(field.name, e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                  >
                    <option value="">-- Не выбрано --</option>
                    {options.map((opt, idx) => (
                      <option key={idx} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.fieldType === "NUMBER" ? (
                  <input
                    type="number"
                    disabled={!canEdit}
                    value={currentVal}
                    onChange={(e) => handleValueChange(field.name, e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                  />
                ) : field.fieldType === "DATE" ? (
                  <input
                    type="date"
                    disabled={!canEdit}
                    value={currentVal}
                    onChange={(e) => handleValueChange(field.name, e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                  />
                ) : (
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={currentVal}
                    onChange={(e) => handleValueChange(field.name, e.target.value)}
                    placeholder="Заполнить поле..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                  />
                )}
              </div>
            );
          })}

          {canEdit && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                {saveSuccess ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Сохранено
                  </span>
                ) : (
                  "Не забудьте сохранить изменения"
                )}
              </span>

              <button
                type="button"
                onClick={handleSaveValues}
                disabled={isSaving}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? "Сохранение..." : "Сохранить поля"}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
