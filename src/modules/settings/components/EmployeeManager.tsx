"use client";

import { useState } from "react";
import { User, Shield, UserPlus, Trash2, Power, AlertCircle, CheckCircle } from "lucide-react";
import { createEmployee, toggleEmployeeStatus, deleteEmployee } from "../actions";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER";
  isActive: boolean;
  createdAt: Date | string;
  _count?: {
    assignedDeals: number;
    assignedContacts: number;
  };
}

interface EmployeeManagerProps {
  employees: Employee[];
  currentUserId: string;
  isAdmin: boolean;
}

export function EmployeeManager({ employees, currentUserId, isAdmin }: EmployeeManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const totalEmployees = employees.length;
  const maxEmployees = 10;
  const isLimitReached = totalEmployees >= maxEmployees;

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createEmployee(formData);

    setLoading(false);
    if (!result.success) {
      setError(result.error || "Ошибка добавления");
    } else {
      setSuccess("Сотрудник успешно добавлен в систему!");
      setIsAdding(false);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  const handleToggleStatus = async (id: string, name: string) => {
    if (!confirm(`Изменить статус доступа для "${name}"?`)) return;
    setError(null);
    const res = await toggleEmployeeStatus(id);
    if (!res.success) {
      setError(res.error || "Не удалось изменить статус");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Вы действительно хотите удалить сотрудника "${name}"? Все закрепленные данные останутся в базе.`)) return;
    setError(null);
    const res = await deleteEmployee(id);
    if (!res.success) {
      setError(res.error || "Не удалось удалить сотрудника");
    } else {
      setSuccess(`Сотрудник "${name}" удален`);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
      {/* Header & Limits */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Команда и сотрудники</h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {totalEmployees} из {maxEmployees} мест
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ролевая модель AmoCRM: Администратор видит всю базу, Менеджер — только свои сделки и задачи.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            disabled={isLimitReached}
            onClick={() => {
              setIsAdding(!isAdding);
              setError(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
              isLimitReached
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 cursor-pointer"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>{isAdding ? "Скрыть форму" : "Добавить сотрудника"}</span>
          </button>
        )}
      </div>

      {/* Limit Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Заполнение штата</span>
          <span className="font-semibold text-slate-700">
            {Math.round((totalEmployees / maxEmployees) * 100)}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isLimitReached ? "bg-amber-500" : "bg-blue-600"
            }`}
            style={{ width: `${(totalEmployees / maxEmployees) * 100}%` }}
          />
        </div>
        {isLimitReached && (
          <p className="text-[11px] text-amber-600 font-medium mt-1">
            Достигнут максимальный лимит в 10 сотрудников для текущего тарифа системы.
          </p>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Add Employee Form */}
      {isAdding && isAdmin && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-in fade-in duration-200"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-blue-600" />
            <span>Новый сотрудник</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                ФИО сотрудника *
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="Иван Иванов"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Email для входа *
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="ivan@crm.local"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Пароль (мин. 6 знаков) *
              </label>
              <input
                type="password"
                name="password"
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Роль в системе *
              </label>
              <select
                name="role"
                defaultValue="MANAGER"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="MANAGER">Менеджер (только свои сделки)</option>
                <option value="ADMIN">Администратор (полный доступ)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Сохранение..." : "Создать сотрудника"}
            </button>
          </div>
        </form>
      )}

      {/* Employees Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Сотрудник</th>
              <th className="py-3 px-4">Роль</th>
              <th className="py-3 px-4">Статус</th>
              <th className="py-3 px-4">Сделок / Контактов</th>
              {isAdmin && <th className="py-3 px-4 text-right">Действия</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => {
              const isCurrent = emp.id === currentUserId;
              const isEmpAdmin = emp.role === "ADMIN";

              return (
                <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{emp.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-semibold border border-blue-200">
                              Вы
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 text-[11px]">{emp.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        isEmpAdmin
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      {isEmpAdmin ? (
                        <>
                          <Shield className="w-3 h-3 text-amber-600" />
                          <span>Администратор</span>
                        </>
                      ) : (
                        <>
                          <User className="w-3 h-3 text-emerald-600" />
                          <span>Менеджер</span>
                        </>
                      )}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        emp.isActive
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          emp.isActive ? "bg-green-500" : "bg-slate-400"
                        }`}
                      />
                      <span>{emp.isActive ? "Активен" : "Заблокирован"}</span>
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {emp._count?.assignedDeals ?? 0}
                    </span>{" "}
                    сделок /{" "}
                    <span className="font-semibold text-slate-800">
                      {emp._count?.assignedContacts ?? 0}
                    </span>{" "}
                    контактов
                  </td>

                  {isAdmin && (
                    <td className="py-3.5 px-4 text-right">
                      {isCurrent ? (
                        <span className="text-[11px] text-slate-400 italic">Текущий профиль</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title={emp.isActive ? "Заблокировать" : "Активировать"}
                            onClick={() => handleToggleStatus(emp.id, emp.name)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                              emp.isActive
                                ? "border-amber-200 text-amber-600 hover:bg-amber-50"
                                : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            title="Удалить сотрудника"
                            onClick={() => handleDelete(emp.id, emp.name)}
                            className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
