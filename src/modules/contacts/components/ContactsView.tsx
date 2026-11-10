"use client";

import { useState } from "react";
import { ContactDetail, CustomFieldDef } from "../types";
import { ContactsTable } from "./ContactsTable";
import { CreateContactModal } from "./CreateContactModal";
import { ContactDrawer } from "./ContactDrawer";
import { useRouter } from "next/navigation";
import { Users, UserPlus, CreditCard, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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

interface ContactsViewProps {
  contacts: ContactDetail[];
  isAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
  customFieldDefs: CustomFieldDef[];
  pipelines: PipelineInfo[];
}

export function ContactsView({
  contacts,
  isAdmin,
  currentUserId,
  users,
  customFieldDefs,
  pipelines,
}: ContactsViewProps) {
  const router = useRouter();
  const [selectedContact, setSelectedContact] = useState<ContactDetail | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Overall statistics for the view
  const totalContactsCount = contacts.length;
  const totalPaidSum = contacts.reduce((sum, c) => sum + c.totalPaidBaseCurrency, 0);

  const handleContactCreated = (newContactId: string) => {
    router.refresh();
  };

  const handleContactDeleted = () => {
    setSelectedContact(null);
    router.refresh();
  };

  // Keep selected contact synced if parent contacts update
  const currentSelected = selectedContact
    ? contacts.find((c) => c.id === selectedContact.id) || selectedContact
    : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">База контактов</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {totalContactsCount} клиентов
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdmin
                  ? "Полный реестр клиентов всех менеджеров компании с историей оплат и кастомными полями"
                  : "Ваши закрепленные контакты (для добавления новых используйте кнопку справа)"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Stats Pill */}
          <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs shadow-xs">
            <span className="text-slate-500">Выручка по базе:</span>
            <strong className="text-emerald-600 font-black">
              {formatCurrency(totalPaidSum, "KZT")}
            </strong>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Добавить контакт</span>
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-800 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Вы вошли как <strong>Менеджер</strong>. В таблице отображаются закрепленные за вами клиенты. Удаление контактов заблокировано ролевой моделью.
          </span>
        </div>
      )}

      {/* Contacts Table */}
      <ContactsTable
        contacts={contacts}
        isAdmin={isAdmin}
        onSelectContact={(c) => setSelectedContact(c)}
        onContactDeleted={handleContactDeleted}
      />

      {/* Create Contact Modal */}
      <CreateContactModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        users={users}
        currentUserId={currentUserId}
        customFieldDefs={customFieldDefs}
        onCreated={handleContactCreated}
      />

      {/* Contact Drawer (Sliding Card) */}
      <ContactDrawer
        contact={currentSelected}
        isOpen={!!currentSelected}
        onClose={() => setSelectedContact(null)}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        users={users}
        customFieldDefs={customFieldDefs}
        pipelines={pipelines}
        onContactDeleted={handleContactDeleted}
      />
    </div>
  );
}
