"use client";

import { useState } from "react";
import { ContactDetail, CustomFieldDef } from "../types";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import { ContactDealsList } from "./ContactDealsList";
import { ContactTimeline } from "./ContactTimeline";
import { EmbeddedWhatsappChat } from "@/modules/whatsapp/components/EmbeddedWhatsappChat";
import { updateContact, deleteContact } from "../actions";
import { formatDate } from "@/lib/utils";
import {
  X,
  Phone,
  Mail,
  Building,
  User,
  Trash2,
  Save,
  Check,
  AlertCircle,
  Calendar,
  MessageCircle,
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

interface ContactDrawerProps {
  contact: ContactDetail | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
  customFieldDefs: CustomFieldDef[];
  pipelines: PipelineInfo[];
  onContactDeleted?: () => void;
}

export function ContactDrawer({
  contact,
  isOpen,
  onClose,
  isAdmin,
  currentUserId,
  users,
  customFieldDefs,
  pipelines,
  onContactDeleted,
}: ContactDrawerProps) {
  if (!isOpen || !contact) return null;

  const canEdit = isAdmin || contact.assignedToId === currentUserId;

  // Local state for basic fields
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [email, setEmail] = useState(contact.email || "");
  const [company, setCompany] = useState(contact.company || "");
  const [assignedToId, setAssignedToId] = useState(contact.assignedToId || "");

  const [savingBasic, setSavingBasic] = useState(false);
  const [basicSaved, setBasicSaved] = useState(false);
  const [basicError, setBasicError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"timeline" | "whatsapp">("timeline");

  const handleSaveBasic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setSavingBasic(true);
    setBasicError(null);
    setBasicSaved(false);

    const res = await updateContact(contact.id, {
      name,
      phone,
      email: email || null,
      company: company || null,
      assignedToId: isAdmin ? assignedToId : undefined,
    });

    setSavingBasic(false);
    if (!res.success) {
      setBasicError(res.error || "Не удалось сохранить контакт");
    } else {
      setBasicSaved(true);
      setTimeout(() => setBasicSaved(false), 3000);
    }
  };

  const handleDeleteContact = async () => {
    if (!isAdmin) return;
    if (
      !confirm(
        `Вы уверены, что хотите безвозвратно удалить контакт «${contact.name}» и связанные с ним данные?`
      )
    ) {
      return;
    }

    setDeleting(true);
    const res = await deleteContact(contact.id);
    setDeleting(false);

    if (!res.success) {
      alert(res.error || "Ошибка удаления");
    } else {
      if (onContactDeleted) onContactDeleted();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* Drawer Container (Sliding from Right) */}
      <div className="absolute inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        {/* Drawer Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-blue-500/20">
              {contact.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{contact.name}</h2>
                <span className="text-[10px] text-slate-400 font-mono">#{contact.id.slice(-6)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Создан: {formatDate(contact.createdAt)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content (2 Columns Layout) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {/* Left Column (5/12): Contact Info & Custom Fields */}
          <div className="md:col-span-5 p-6 space-y-6 overflow-y-auto">
            {basicError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{basicError}</span>
              </div>
            )}

            {/* Basic Info Form */}
            <form onSubmit={handleSaveBasic} className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Основная информация
                </span>
                {basicSaved && (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Сохранено
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  ФИО клиента *
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEdit}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Номер телефона *
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    disabled={!canEdit}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Email адрес
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    disabled={!canEdit}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@mail.kz"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Компания / Организация
                </label>
                <div className="relative">
                  <Building className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="ТОО или Физ. лицо"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-70"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ответственный сотрудник
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <select
                    disabled={!isAdmin}
                    value={assignedToId}
                    onChange={(e) => setAssignedToId(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-medium disabled:opacity-70"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                {!isAdmin && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Переназначать ответственного может только Администратор
                  </p>
                )}
              </div>

              {canEdit && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingBasic}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingBasic ? "Сохранение..." : "Сохранить данные"}</span>
                  </button>
                </div>
              )}
            </form>

            <div className="border-t border-slate-200" />

            {/* Custom Fields Editor & Constructor */}
            <CustomFieldsEditor
              contactId={contact.id}
              initialValues={contact.customFields || {}}
              fieldDefs={customFieldDefs}
              isAdmin={isAdmin}
              canEdit={canEdit}
            />

            {/* Delete Contact Section (STRICTLY ADMIN ONLY) */}
            {isAdmin && (
              <div className="pt-6 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleDeleteContact}
                  disabled={deleting}
                  className="w-full py-2 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>{deleting ? "Удаление..." : "Удалить контакт из CRM"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column (7/12): Financial Widget, Deals, Unified Timeline / WhatsApp */}
          <div className="md:col-span-7 p-6 space-y-6 overflow-y-auto bg-slate-50/50">
            {/* Deals & Financial Widget */}
            <ContactDealsList
              contactId={contact.id}
              deals={contact.deals}
              totalPaidBaseCurrency={contact.totalPaidBaseCurrency}
              pipelines={pipelines}
              users={users}
              currentUserId={currentUserId}
            />

            <div className="border-t border-slate-200" />

            {/* Tab Navigation: Timeline vs WhatsApp */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveRightTab("timeline")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeRightTab === "timeline"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Лента событий (Таймлайн)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRightTab("whatsapp")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeRightTab === "whatsapp"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Чат WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            {activeRightTab === "timeline" ? (
              <ContactTimeline
                contactId={contact.id}
                notes={contact.notes}
                deals={contact.deals}
                payments={contact.payments}
                tasks={contact.tasks}
                canAddNote={canEdit}
              />
            ) : (
              <EmbeddedWhatsappChat
                contactId={contact.id}
                contactPhone={contact.phone}
                contactName={contact.name}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
