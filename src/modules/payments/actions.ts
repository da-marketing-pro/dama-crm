"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Currency, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Требуется авторизация в системе");
  }
  return session.user;
}

// 1. Добавление платежа (транша) к сделке
export async function addPayment(
  dealId: string,
  data: {
    amount: number;
    currency: Currency;
    paymentDate?: Date | string;
    comment?: string;
  }
) {
  try {
    const user = await getAuthUser();

    if (!data.amount || data.amount <= 0) {
      return { success: false, error: "Укажите положительную сумму оплаты" };
    }

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { contact: true },
    });

    if (!deal) {
      return { success: false, error: "Сделка не найдена" };
    }

    // Менеджер может добавлять платежи только к своим сделкам
    if (user.role === Role.MANAGER && deal.assignedToId !== user.id) {
      return { success: false, error: "Вы можете добавлять оплаты только к своим сделкам" };
    }

    // Получаем текущие курсы валют для авторасчета в базовую валюту
    const currencySetting = await prisma.currencySetting.findFirst();
    const baseCurrency = currencySetting?.baseCurrency || Currency.USD;
    const rateUsd = currencySetting?.rateUsd || 495.0;
    const rateRub = currencySetting?.rateRub || 5.2;

    // Конвертация в KZT
    let kztAmount = Number(data.amount);
    if (data.currency === Currency.USD) {
      kztAmount = Number(data.amount) * rateUsd;
    } else if (data.currency === Currency.RUB) {
      kztAmount = Number(data.amount) * rateRub;
    }

    // Конвертация из KZT в базовую валюту системы
    let amountInBaseCurrency = kztAmount;
    if (baseCurrency === Currency.USD) {
      amountInBaseCurrency = kztAmount / rateUsd;
    } else if (baseCurrency === Currency.RUB) {
      amountInBaseCurrency = kztAmount / rateRub;
    }

    const payment = await prisma.payment.create({
      data: {
        dealId,
        contactId: deal.contactId,
        amount: Number(data.amount),
        currency: data.currency,
        amountInBaseCurrency: Math.round(amountInBaseCurrency * 100) / 100,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        comment: data.comment?.trim() || null,
      },
    });

    // Создаем запись в таймлайне контакта
    const symbolMap: Record<string, string> = { USD: "$", RUB: "₽", KZT: "₸" };
    const baseSymbol = symbolMap[baseCurrency] || baseCurrency;

    await prisma.contactNote.create({
      data: {
        contactId: deal.contactId,
        authorId: user.id,
        content: `Получен платеж (транш): +${payment.amount} ${payment.currency} (≈ ${(Math.round(amountInBaseCurrency * 100) / 100).toLocaleString("ru-RU")} ${baseSymbol}) по сделке «${deal.title}»${data.comment ? ` — ${data.comment}` : ""}`,
      },
    });

    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { success: true, paymentId: payment.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка добавления платежа";
    return { success: false, error: message };
  }
}

// 2. Удаление платежа (СТРОГО ДЛЯ ADMIN)
export async function deletePayment(paymentId: string) {
  try {
    const user = await getAuthUser();

    if (user.role !== Role.ADMIN) {
      return {
        success: false,
        error: "Доступ запрещен: удаление платежей разрешено только Администратору",
      };
    }

    await prisma.payment.delete({
      where: { id: paymentId },
    });

    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления платежа";
    return { success: false, error: message };
  }
}
