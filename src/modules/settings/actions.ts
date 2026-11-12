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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 1. Создание нового сотрудника (Лимит до 10 человек)
export async function createEmployee(formData: FormData) {
  try {
    await ensureAdmin();

    const name = (formData.get("name") as string)?.trim();
    const email = (formData.get("email") as string)?.toLowerCase().trim();
    const recoveryEmailRaw = (formData.get("recoveryEmail") as string)?.toLowerCase().trim();
    const recoveryEmail = recoveryEmailRaw || null;
    const password = formData.get("password") as string;
    const role = (formData.get("role") as Role) || Role.MANAGER;

    if (!name || !email || !password) {
      return { success: false, error: "Заполните все обязательные поля" };
    }

    if (!EMAIL_REGEX.test(email)) {
      return { success: false, error: "Укажите корректный email для входа" };
    }

    if (recoveryEmail && !EMAIL_REGEX.test(recoveryEmail)) {
      return { success: false, error: "Укажите корректную почту для восстановления" };
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
        recoveryEmail,
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

// 1.1. Редактирование данных сотрудника (ФИО, логин/email, почта восстановления, пароль, роль)
export async function updateEmployee(formData: FormData) {
  try {
    const admin = await ensureAdmin();

    const userId = (formData.get("userId") as string)?.trim();
    const name = (formData.get("name") as string)?.trim();
    const email = (formData.get("email") as string)?.toLowerCase().trim();
    const recoveryEmailRaw = (formData.get("recoveryEmail") as string)?.toLowerCase().trim();
    const recoveryEmail = recoveryEmailRaw || null;
    const password = (formData.get("password") as string) || "";
    const role = (formData.get("role") as Role) || Role.MANAGER;

    if (!userId || !name || !email) {
      return { success: false, error: "Заполните обязательные поля: ФИО и Email для входа" };
    }

    if (!EMAIL_REGEX.test(email)) {
      return { success: false, error: "Укажите корректный email для входа" };
    }

    if (recoveryEmail && !EMAIL_REGEX.test(recoveryEmail)) {
      return { success: false, error: "Укажите корректный адрес почты для восстановления" };
    }

    if (password.trim().length > 0 && password.length < 6) {
      return { success: false, error: "Новый пароль должен содержать не менее 6 символов" };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return { success: false, error: "Сотрудник не найден" };
    }

    if (admin.id === userId && role !== Role.ADMIN) {
      return {
        success: false,
        error: "Вы не можете понизить собственную роль Администратора",
      };
    }

    if (targetUser.role === Role.ADMIN && role !== Role.ADMIN) {
      const activeAdminsCount = await prisma.user.count({
        where: { role: Role.ADMIN, isActive: true },
      });
      if (activeAdminsCount <= 1) {
        return {
          success: false,
          error: "В системе должен оставаться хотя бы один активный Администратор",
        };
      }
    }

    // Проверка уникальности нового email
    const duplicate = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: userId },
      },
    });

    if (duplicate) {
      return {
        success: false,
        error: "Этот email для входа уже занят другим пользователем",
      };
    }

    const updateData: {
      name: string;
      email: string;
      recoveryEmail: string | null;
      role: Role;
      passwordHash?: string;
    } = {
      name,
      email,
      recoveryEmail,
      role,
    };

    if (password.trim().length > 0) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/deals");
    revalidatePath("/contacts");

    return {
      success: true,
      reloginRecommended: admin.id === userId && (email !== targetUser.email || password.trim().length > 0),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления данных сотрудника";
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

// 6. Привязка почты восстановления к текущему аккаунту администратора
export async function updateAdminRecoveryEmail(formData: FormData) {
  try {
    const admin = await ensureAdmin();
    const recoveryEmailRaw = (formData.get("recoveryEmail") as string)?.toLowerCase().trim() || "";
    const recoveryEmail = recoveryEmailRaw || null;

    if (recoveryEmail && !EMAIL_REGEX.test(recoveryEmail)) {
      return { success: false, error: "Укажите корректный email для восстановления пароля" };
    }

    await prisma.user.update({
      where: { id: admin.id },
      data: { recoveryEmail },
    });

    revalidatePath("/settings");
    return { success: true, recoveryEmail };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения почты восстановления";
    return { success: false, error: message };
  }
}

// 7. Сохранение настроек SMTP для отправки писем восстановления пароля
export async function saveSmtpSettings(formData: FormData) {
  try {
    await ensureAdmin();

    const host = (formData.get("host") as string)?.trim() || "";
    const port = parseInt((formData.get("port") as string) || "465", 10) || 465;
    const secure = port === 465 || formData.get("secure") === "true";
    const user = (formData.get("user") as string)?.trim() || "";
    const passwordInput = (formData.get("password") as string) || "";
    const fromEmail = ((formData.get("fromEmail") as string) || user).trim();
    const fromName = (formData.get("fromName") as string)?.trim() || "DAMA CRM";
    const enabled = formData.get("enabled") === "true";

    if (enabled && (!host || !user)) {
      return {
        success: false,
        error: "Для включения отправки писем заполните SMTP сервер и логин (Email)",
      };
    }

    const existing = await prisma.smtpSetting.findFirst();
    const finalPassword = passwordInput.trim() ? passwordInput : existing?.password || "";

    if (enabled && !finalPassword) {
      return {
        success: false,
        error: "Укажите пароль от SMTP / пароль приложения",
      };
    }

    if (existing) {
      await prisma.smtpSetting.update({
        where: { id: existing.id },
        data: {
          host,
          port,
          secure,
          user,
          password: finalPassword,
          fromEmail,
          fromName,
          enabled,
        },
      });
    } else {
      await prisma.smtpSetting.create({
        data: {
          host,
          port,
          secure,
          user,
          password: finalPassword,
          fromEmail,
          fromName,
          enabled,
        },
      });
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения SMTP-настроек";
    return { success: false, error: message };
  }
}

// 8. Отправка тестового письма для проверки SMTP
export async function testSmtpConnection(recipientEmail: string) {
  try {
    const admin = await ensureAdmin();
    const targetEmail = (recipientEmail || "").toLowerCase().trim();

    if (!targetEmail || !EMAIL_REGEX.test(targetEmail)) {
      return {
        success: false,
        error: "Укажите корректный email получателя (или сначала привяжите почту восстановления)",
      };
    }

    const { sendMail } = await import("@/lib/mailer");
    const result = await sendMail({
      to: targetEmail,
      subject: "Тест отправки почты — DAMA CRM",
      text: `Привет, ${admin.name || "Администратор"}! Почтовый сервер SMTP для DAMA CRM настроен корректно.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; background: #f8fafc; border-radius: 12px;">
          <div style="background: #fff; border: 1px solid #e2e8f0; padding: 20px; border-radius: 10px;">
            <h3 style="margin: 0 0 8px; color: #0f172a;">Почта DAMA CRM работает!</h3>
            <p style="margin: 0; color: #334155; font-size: 14px;">
              SMTP-сервер успешно подключен. Функция восстановления пароля готова к работе.
            </p>
          </div>
        </div>
      `,
    });

    if (!result.sent) {
      return { success: false, error: result.error || "Не удалось отправить письмо" };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка тестирования SMTP";
    return { success: false, error: message };
  }
}
