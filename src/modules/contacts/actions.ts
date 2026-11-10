"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Currency, FieldType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

// Проверка сессии
async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Требуется авторизация в системе");
  }
  return session.user;
}

// 1. Создание контакта
export async function createContact(formData: {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  assignedToId?: string;
  customFields?: Record<string, any>;
}) {
  try {
    const user = await getAuthUser();

    if (!formData.name?.trim() || !formData.phone?.trim()) {
      return { success: false, error: "Укажите имя и номер телефона контакта" };
    }

    const normalizedPhone = formData.phone.trim();

    // Проверка на дубликаты по телефону
    const existing = await prisma.contact.findFirst({
      where: { phone: normalizedPhone },
    });

    if (existing) {
      return {
        success: false,
        error: `Контакт с телефоном ${normalizedPhone} уже существует («${existing.name}»)`,
      };
    }

    // Если ответственный не указан, назначаем создателя или админа
    const assignedId = formData.assignedToId || user.id;

    const contact = await prisma.contact.create({
      data: {
        name: formData.name.trim(),
        phone: normalizedPhone,
        email: formData.email?.trim() || null,
        company: formData.company?.trim() || null,
        assignedToId: assignedId,
        customFields: formData.customFields || {},
      },
    });

    revalidatePath("/contacts");
    return { success: true, contactId: contact.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка создания контакта";
    return { success: false, error: message };
  }
}

// 2. Обновление контакта (основные данные + кастомные поля)
export async function updateContact(
  contactId: string,
  formData: {
    name?: string;
    phone?: string;
    email?: string | null;
    company?: string | null;
    assignedToId?: string | null;
    customFields?: Record<string, any>;
  }
) {
  try {
    const user = await getAuthUser();

    // Проверка прав: менеджер может обновлять только свои контакты
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return { success: false, error: "Контакт не найден" };
    }

    if (user.role === Role.MANAGER && contact.assignedToId !== user.id) {
      return {
        success: false,
        error: "Доступ ограничен: вы можете редактировать только свои контакты",
      };
    }

    const updateData: any = {};
    if (formData.name !== undefined) updateData.name = formData.name.trim();
    if (formData.phone !== undefined) updateData.phone = formData.phone.trim();
    if (formData.email !== undefined) updateData.email = formData.email ? formData.email.trim() : null;
    if (formData.company !== undefined) updateData.company = formData.company ? formData.company.trim() : null;
    if (formData.assignedToId !== undefined) {
      // Только админ может переназначать контакт на другого менеджера
      if (user.role === Role.ADMIN) {
        updateData.assignedToId = formData.assignedToId;
      }
    }
    if (formData.customFields !== undefined) {
      updateData.customFields = formData.customFields;
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    });

    revalidatePath("/contacts");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления контакта";
    return { success: false, error: message };
  }
}

// 3. Удаление контакта (СТРОГО ДЛЯ ADMIN)
export async function deleteContact(contactId: string) {
  try {
    const user = await getAuthUser();

    if (user.role !== Role.ADMIN) {
      return {
        success: false,
        error: "Доступ запрещен: удаление контактов разрешено исключительно Администратору",
      };
    }

    await prisma.contact.delete({
      where: { id: contactId },
    });

    revalidatePath("/contacts");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления контакта";
    return { success: false, error: message };
  }
}

// 4. Добавление заметки в ленту контакта
export async function addContactNote(contactId: string, content: string) {
  try {
    const user = await getAuthUser();

    if (!content?.trim()) {
      return { success: false, error: "Введите текст примечания" };
    }

    const note = await prisma.contactNote.create({
      data: {
        contactId,
        authorId: user.id,
        content: content.trim(),
      },
    });

    revalidatePath("/contacts");
    return { success: true, noteId: note.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка добавления примечания";
    return { success: false, error: message };
  }
}

// 5. Создание сделки прямо из карточки контакта
export async function createDealForContact(data: {
  contactId: string;
  title: string;
  pipelineId: string;
  stageId: string;
  totalBudget: number;
  currency: Currency;
  assignedToId?: string;
}) {
  try {
    const user = await getAuthUser();

    if (!data.title?.trim() || !data.pipelineId || !data.stageId) {
      return { success: false, error: "Заполните название сделки, воронку и этап" };
    }

    const currencySetting = await prisma.currencySetting.findFirst();
    let exchangeRate = 1.0;
    if (data.currency === Currency.USD) {
      exchangeRate = currencySetting?.rateUsd || 495.0;
    } else if (data.currency === Currency.RUB) {
      exchangeRate = currencySetting?.rateRub || 5.2;
    }

    const deal = await prisma.deal.create({
      data: {
        title: data.title.trim(),
        contactId: data.contactId,
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        totalBudget: Number(data.totalBudget) || 0,
        currency: data.currency,
        exchangeRateAtCreation: exchangeRate,
        assignedToId: data.assignedToId || user.id,
      },
    });

    // Автоматическая системная запись в ленту контакта
    await prisma.contactNote.create({
      data: {
        contactId: data.contactId,
        authorId: user.id,
        content: `Создана новая сделка: «${deal.title}» на сумму ${deal.totalBudget} ${deal.currency}`,
      },
    });

    revalidatePath("/contacts");
    revalidatePath("/deals");
    revalidatePath("/");
    return { success: true, dealId: deal.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка создания сделки";
    return { success: false, error: message };
  }
}

// 6. Создание кастомного поля (только ADMIN)
export async function createCustomFieldDefinition(data: {
  name: string;
  fieldType: FieldType;
  options?: string[];
  isRequired?: boolean;
}) {
  try {
    const user = await getAuthUser();

    if (user.role !== Role.ADMIN) {
      return {
        success: false,
        error: "Доступ запрещен: настраивать кастомные поля может только Администратор",
      };
    }

    if (!data.name?.trim()) {
      return { success: false, error: "Укажите название поля" };
    }

    const field = await prisma.customFieldDefinition.create({
      data: {
        entityType: "CONTACT",
        name: data.name.trim(),
        fieldType: data.fieldType,
        options: data.options ? JSON.stringify(data.options) : "[]",
        isRequired: !!data.isRequired,
      },
    });

    revalidatePath("/contacts");
    return { success: true, fieldId: field.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка создания поля";
    return { success: false, error: message };
  }
}

// 7. Удаление кастомного поля (только ADMIN)
export async function deleteCustomFieldDefinition(fieldId: string) {
  try {
    const user = await getAuthUser();

    if (user.role !== Role.ADMIN) {
      return {
        success: false,
        error: "Доступ запрещен: удалять кастомные поля может только Администратор",
      };
    }

    await prisma.customFieldDefinition.delete({
      where: { id: fieldId },
    });

    revalidatePath("/contacts");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления поля";
    return { success: false, error: message };
  }
}
