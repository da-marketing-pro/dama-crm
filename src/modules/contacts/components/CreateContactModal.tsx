"use client";

import { useState } from "react";
import { CustomFieldDef } from "../types";
import { createContact } from "../actions";
import { X, UserPlus, AlertCircle, CheckCircle, Phone, Mail, Building, User } from "lucide-react";

interface CreateContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: { id: string; name: string }[];
  currentUserId: string;
  customFieldDefs: CustomFieldDef[];
  onCreated?: (contactId: string) => void;
}

export function CreateContactModal({
  isOpen,
  onClose,
  users,
  currentUserId,
  customFieldDefs,
  onCreated,
}: CreateContactModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [assignedToId, setAssignedToId] = useState(currentUserId);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCustomFieldChange = (fieldName: string, value: any) => {
    setCustomFields((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await createContact({
      name,
      phone,
      email: email || undefined,
      company: company || undefined,
      assignedToId,
      customFields,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error || "Не удалось создать контакт");
    } else {
      if (onCreated && res.contactId) {
        onCreated(res.contactId);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Новый контакт</h3>
              <p className="text-xs text-slate-500">Добавление клиента напрямую в общую базу</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ФИО клиента / Имя контакта *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Касымов Ерлан"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Номер телефона *
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (701) 123-45-67"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Электронная почта
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@mail.kz"
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
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="ТОО «Касымов Групп»"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ответственный менеджер
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <select
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Dynamic Custom Fields */}
          {customFieldDefs.length > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Кастомные поля контакта
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customFieldDefs.map((field) => {
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

                  return (
                    <div key={field.id}>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {field.name} {field.isRequired && "*"}
                      </label>

                      {field.fieldType === "SELECT" ? (
                        <select
                          value={customFields[field.name] || ""}
                          onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- Выберите вариант --</option>
                          {options.map((opt, i) => (
                            <option key={i} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.fieldType === "NUMBER" ? (
                        <input
                          type="number"
                          value={customFields[field.name] || ""}
                          onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                          placeholder="Числовое значение"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : field.fieldType === "DATE" ? (
                        <input
                          type="date"
                          value={customFields[field.name] || ""}
                          onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={customFields[field.name] || ""}
                          onChange={(e) => handleCustomFieldChange(field.name, e.target.value)}
                          placeholder="Введите значение"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
              {loading ? "Сохранение..." : "Создать контакт"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
