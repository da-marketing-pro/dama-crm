"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { Currency, Role } from "@prisma/client";

// Guard: verify admin
async function ensureAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Доступ запрещен: действие разрешено только Администратору");
  }
  return session.user;
}

// 1. Создание нового сотрудника (Лимит до 10 человек)
export async function createEmployee(formData: FormData) {
  try {
    await ensureAdmin();

    const name = formData.get("name") as string;
    const email = (formData.get("email") as string)?.toLowerCase().trim();
    const password = formData.get("password") as string;
    const role = (formData.get("role") as Role) || Role.MANAGER;

    if (!name || !email || !password) {
      return { success: false, error: "Заполните все обязательные поля" };
    }

    if (password.length < 6) {
      return { success: false, error: "Пароль должен содержать не менее 6 символов" };
    }

    // Проверка лимита в 10 сотрудников
    const currentUsersCount = await prisma.user.count();
    if (currentUsersCount >= 10) {
      return {
        success: false,
        error: `Лимит сотрудников (${currentUsersCount}/10) исчерпан. Система поддерживает до 10 активных пользователей.`,
      };
    }

    // Проверка уникальности email
    const existing = await prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      return { success: false, error: "Пользователь с таким email уже существует" };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        isActive: true,
      },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка создания сотрудника";
    return { success: false, error: message };
  }
}

// 2. Переключение активности сотрудника (блокировка/разблокировка)
export async function toggleEmployeeStatus(userId: string) {
  try {
    const admin = await ensureAdmin();

    if (admin.id === userId) {
      return { success: false, error: "Вы не можете отключить собственную учетную запись" };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return { success: false, error: "Сотрудник не найден" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: !targetUser.isActive },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления статуса";
    return { success: false, error: message };
  }
}

// 3. Удаление сотрудника (только Админ)
export async function deleteEmployee(userId: string) {
  try {
    const admin = await ensureAdmin();

    if (admin.id === userId) {
      return { success: false, error: "Вы не можете удалить собственную учетную запись" };
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления сотрудника";
    return { success: false, error: message };
  }
}

// 4. Обновление курсов валют
export async function updateCurrencySettings(formData: FormData) {
  try {
    await ensureAdmin();

    const baseCurrency = (formData.get("baseCurrency") as Currency) || Currency.KZT;
    const rateUsd = parseFloat(formData.get("rateUsd") as string) || 495.0;
    const rateRub = parseFloat(formData.get("rateRub") as string) || 5.2;

    const existingSetting = await prisma.currencySetting.findFirst();

    if (existingSetting) {
      await prisma.currencySetting.update({
        where: { id: existingSetting.id },
        data: {
          baseCurrency,
          rateUsd,
          rateRub,
          rateKzt: 1.0,
        },
      });
    } else {
      await prisma.currencySetting.create({
        data: {
          baseCurrency,
          rateUsd,
          rateRub,
          rateKzt: 1.0,
        },
      });
    }

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения курсов";
    return { success: false, error: message };
  }
}

// 5. Синхронизация средних курсов за 60 дней (2 месяца)
export async function syncAverageCurrencyRates() {
  try {
    await ensureAdmin();
    const { calculate60DaysAverageRates } = await import("@/lib/currencyService");
    const avgData = await calculate60DaysAverageRates();

    const existingSetting = await prisma.currencySetting.findFirst();
    let updatedSetting;

    // КРИТИЧЕСКОЕ ПРАВИЛО: Обновляется ТОЛЬКО CurrencySetting!
    // Сделки и платежи категорически НЕ пересчитываются.
    if (existingSetting) {
      updatedSetting = await prisma.currencySetting.update({
        where: { id: existingSetting.id },
        data: {
          rateUsd: avgData.rateUsd,
          rateRub: avgData.rateRub,
          updatedAt: new Date(),
        },
      });
    } else {
      updatedSetting = await prisma.currencySetting.create({
        data: {
          baseCurrency: Currency.USD,
          rateUsd: avgData.rateUsd,
          rateRub: avgData.rateRub,
          rateKzt: 1.0,
        },
      });
    }

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/dashboard");

    return {
      success: true,
      newRates: {
        rateUsd: updatedSetting.rateUsd,
        rateRub: updatedSetting.rateRub,
      },
      updatedAt: updatedSetting.updatedAt.toISOString(),
      daysSampled: avgData.daysSampled,
      source: avgData.source,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка синхронизации курсов";
    return { success: false, error: message };
  }
}
