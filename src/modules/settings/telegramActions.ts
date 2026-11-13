"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendTelegramMessage, sendDailyTasksDigest } from "@/lib/telegramService";

async function getAdminUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Доступ разрешен только Администратору");
  }
  return session.user;
}

export async function getTelegramSettingAction() {
  try {
    await getAdminUser();
    const setting = await prisma.telegramSetting.findFirst();

    if (!setting) {
      return {
        success: true,
        setting: {
          botToken: "",
          chatId: "",
          enabled: false,
          sendTime: "09:45",
          hasToken: false,
        },
      };
    }

    return {
      success: true,
      setting: {
        botToken: setting.botToken ? `${setting.botToken.slice(0, 6)}••••••••${setting.botToken.slice(-4)}` : "",
        chatId: setting.chatId,
        enabled: setting.enabled,
        sendTime: setting.sendTime || "09:45",
        hasToken: Boolean(setting.botToken),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка загрузки настроек Telegram";
    return { success: false, error: message };
  }
}

export async function saveTelegramSettingAction(data: {
  botToken?: string;
  chatId: string;
  enabled: boolean;
  sendTime?: string;
}) {
  try {
    await getAdminUser();

    if (!data.chatId?.trim()) {
      return { success: false, error: "Укажите Telegram Chat ID" };
    }

    const existing = await prisma.telegramSetting.findFirst();

    const updateData: {
      chatId: string;
      enabled: boolean;
      sendTime: string;
      botToken?: string;
    } = {
      chatId: data.chatId.trim(),
      enabled: Boolean(data.enabled),
      sendTime: data.sendTime?.trim() || "09:45",
    };

    if (data.botToken && !data.botToken.includes("••••")) {
      updateData.botToken = data.botToken.trim();
    }

    if (existing) {
      await prisma.telegramSetting.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      await prisma.telegramSetting.create({
        data: {
          ...updateData,
          botToken: updateData.botToken || "",
        },
      });
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения настроек Telegram";
    return { success: false, error: message };
  }
}

export async function testSendTelegramDigestAction() {
  try {
    await getAdminUser();
    const result = await sendDailyTasksDigest({ force: true });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка отправки тестового сообщения";
    return { success: false, error: message };
  }
}
