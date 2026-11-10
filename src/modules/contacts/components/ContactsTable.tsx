"use client";

import { useState, useMemo } from "react";
import { ContactDetail } from "../types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteContact } from "../actions";
import {
  Phone,
  Building,
  User,
  ArrowUpDown,
  Trash2,
  Briefcase,
  CreditCard,
  Search,
  Calendar,
  ChevronRight,
} from "lucide-react";

interface ContactsTableProps {
  contacts: ContactDetail[];
  isAdmin: boolean;
  onSelectContact: (contact: ContactDetail) => void;
  onContactDeleted?: () => void;
}

type SortField = "name" | "totalPaid" | "createdAt" | "dealsCount";
type SortOrder = "asc" | "desc";

export function ContactsTable({
  contacts,
  isAdmin,
  onSelectContact,
  onContactDeleted,
}: ContactsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredAndSortedContacts = useMemo(() => {
    let result = [...contacts];

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = a.name.localeCompare(b.name, "ru");
      } else if (sortField === "totalPaid") {
        comparison = a.totalPaidBaseCurrency - b.totalPaidBaseCurrency;
      } else if (sortField === "dealsCount") {
        comparison = a.deals.length - b.deals.length;
      } else if (sortField === "createdAt") {
        comparison =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [contacts, searchQuery, sortField, sortOrder]);

  const handleDelete = async (e: React.MouseEvent, contact: ContactDetail) => {
    e.stopPropagation();
    if (!isAdmin) return;

    if (!confirm(`Вы действительно хотите удалить контакт «${contact.name}»?`)) {
      return;
    }

    setDeletingId(contact.id);
    const res = await deleteContact(contact.id);
    setDeletingId(null);

    if (!res.success) {
      alert(res.error || "Ошибка удаления");
    } else if (onContactDeleted) {
      onContactDeleted();
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, телефону или компании..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-slate-500">
          <span>Сортировка:</span>
          <select
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split("-") as [SortField, SortOrder];
              setSortField(field);
              setSortOrder(order);
            }}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="createdAt-desc">Сначала новые контакты</option>
            <option value="createdAt-asc">Сначала старые контакты</option>
            <option value="name-asc">По имени (А-Я)</option>
            <option value="name-desc">По имени (Я-А)</option>
            <option value="totalPaid-desc">По сумме оплат (убывание)</option>
            <option value="totalPaid-asc">По сумме оплат (возрастание)</option>
            <option value="dealsCount-desc">По количеству сделок</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px] select-none">
              <tr>
                <th
                  onClick={() => handleSort("name")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Имя клиента</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4">Телефон</th>
                <th className="py-3 px-4">Ответственный</th>
                <th
                  onClick={() => handleSort("dealsCount")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Сделок</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("totalPaid")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Сумма всех оплат (₸)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("createdAt")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Дата создания</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Контакты не найдены. Создайте первый контакт с помощью кнопки выше.
                  </td>
                </tr>
              ) : (
                filteredAndSortedContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => onSelectContact(contact)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    {/* Name & Company */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-blue-100 text-slate-700 group-hover:text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 transition-colors">
                          {contact.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {contact.name}
                          </div>
                          {contact.company && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Building className="w-3 h-3" />
                              <span>{contact.company}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{contact.phone}</span>
                      </div>
                    </td>

                    {/* Responsible Employee */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                        <User className="w-3 h-3 text-slate-400" />
                        <span>{contact.assignedTo?.name || "Не назначен"}</span>
                      </span>
                    </td>

                    {/* Deals count */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span>{contact.deals.length}</span>
                      </span>
                    </td>

                    {/* Total Paid in Base Currency */}
                    <td className="py-3.5 px-4">
                      <div className="font-black text-emerald-600 flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{formatCurrency(contact.totalPaidBaseCurrency, "KZT")}</span>
                      </div>
                    </td>

                    {/* Created At */}
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {formatDate(contact.createdAt)}
                    </td>

                    {/* Actions: Delete Strictly for Admin */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isAdmin && (
                          <button
                            type="button"
                            title="Удалить контакт (только Администратор)"
                            onClick={(e) => handleDelete(e, contact)}
                            disabled={deletingId === contact.id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
