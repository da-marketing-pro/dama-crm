"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WhatsappMessageType, WhatsappStatus, StageType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ChatConversation, WhatsappMessageItem } from "./types";

async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Требуется авторизация в системе");
  }
  return session.user;
}

// 1. Получить или создать инстанс по умолчанию
export async function getOrCreateDefaultInstance() {
  let instance = await prisma.whatsappInstance.findFirst({
    where: { isDefault: true },
  });

  if (!instance) {
    instance = await prisma.whatsappInstance.findFirst();
  }

  if (!instance) {
    instance = await prisma.whatsappInstance.create({
      data: {
        name: "Основной WhatsApp (Отдел продаж)",
        phoneNumber: "+7 (701) 999-88-77",
        status: WhatsappStatus.CONNECTED,
        apiUrl: "https://api.waha.dev/v1",
        apiKey: "demo-waha-api-key-secure",
        isDefault: true,
      },
    });
  }

  return instance;
}

// 2. Обновить настройки инстанса
export async function updateInstanceSettings(
  instanceId: string,
  data: {
    name?: string;
    phoneNumber?: string;
    apiUrl?: string;
    apiKey?: string;
    status?: WhatsappStatus;
  }
) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Настройка WhatsApp доступна только Администратору" };
    }

    const updated = await prisma.whatsappInstance.update({
      where: { id: instanceId },
      data,
    });

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");
    return { success: true, instance: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления настроек";
    return { success: false, error: message };
  }
}

// 3. Отправить сообщение клиенту в WhatsApp
export async function sendWhatsappMessage(data: {
  instanceId?: string;
  remoteJid: string;
  contactId?: string;
  dealId?: string;
  messageType: WhatsappMessageType;
  textContent?: string;
  mediaUrl?: string;
  fileName?: string;
}) {
  try {
    const user = await getAuthUser();

    let instanceId = data.instanceId;
    if (!instanceId) {
      const inst = await getOrCreateDefaultInstance();
      instanceId = inst.id;
    }

    // Сохраняем исходящее сообщение
    const message = await prisma.whatsappMessage.create({
      data: {
        instanceId,
        remoteJid: data.remoteJid,
        contactId: data.contactId || null,
        dealId: data.dealId || null,
        fromMe: true,
        senderName: user.name || "Менеджер",
        messageType: data.messageType,
        textContent: data.textContent || null,
        mediaUrl: data.mediaUrl || null,
        fileName: data.fileName || null,
        timestamp: new Date(),
      },
    });

    // Если указан контакт — добавляем запись в таймлайн
    if (data.contactId) {
      let previewText = data.textContent || "Вложение";
      if (data.messageType === WhatsappMessageType.AUDIO) previewText = "Голосовое сообщение (исходящее)";
      if (data.messageType === WhatsappMessageType.IMAGE) previewText = "Изображение (исходящее)";
      if (data.messageType === WhatsappMessageType.DOCUMENT) previewText = `Документ: ${data.fileName || "Файл"}`;

      await prisma.contactNote.create({
        data: {
          contactId: data.contactId,
          authorId: user.id,
          content: `WhatsApp (Исходящее): ${previewText}`,
        },
      });
    }

    revalidatePath("/whatsapp");
    revalidatePath("/contacts");
    revalidatePath("/deals");
    return { success: true, messageId: message.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка отправки сообщения";
    return { success: false, error: message };
  }
}

// 4. Логика обработки входящего вебхука WhatsApp (вызывается из API и симулятора)
export async function processIncomingWhatsappWebhook(payload: {
  phone: string;
  senderName?: string;
  messageType?: WhatsappMessageType;
  textContent?: string;
  mediaUrl?: string;
  fileName?: string;
  instanceId?: string;
}) {
  try {
    const cleanPhone = payload.phone.replace(/[^\d+]/g, "").trim();
    if (!cleanPhone) {
      return { success: false, error: "Номер телефона не указан" };
    }

    let instanceId = payload.instanceId;
    if (!instanceId) {
      const defaultInst = await getOrCreateDefaultInstance();
      instanceId = defaultInst.id;
    }

    // 1. Проверяем, существует ли контакт
    let contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          { phone: { contains: cleanPhone.slice(-10) } }, // Совпадение по последним 10 цифрам
        ],
      },
      include: {
        deals: {
          include: { stage: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    let dealId: string | null = null;
    let isNewContact = false;

    // Находим первого пользователя (админа или менеджера) для назначения
    const firstUser = await prisma.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
    const assignedUserId = firstUser?.id;

    if (!contact) {
      isNewContact = true;
      // Создаем новый контакт
      contact = await prisma.contact.create({
        data: {
          name: payload.senderName || `Лид WhatsApp (${cleanPhone})`,
          phone: cleanPhone,
          company: "WhatsApp Лид",
          assignedToId: assignedUserId,
        },
        include: {
          deals: {
            include: { stage: true },
          },
        },
      });

      // Ищем дефолтную воронку и её первый этап
      let defaultPipeline = await prisma.pipeline.findFirst({
        where: { isDefault: true },
        include: { stages: { orderBy: { order: "asc" } } },
      });

      if (!defaultPipeline) {
        defaultPipeline = await prisma.pipeline.findFirst({
          include: { stages: { orderBy: { order: "asc" } } },
        });
      }

      if (defaultPipeline && defaultPipeline.stages.length > 0) {
        const firstStage = defaultPipeline.stages[0];

        // Создаем новую сделку на первом этапе («Неразобранное»)
        const newDeal = await prisma.deal.create({
          data: {
            title: `Лид из WhatsApp: ${contact.name}`,
            contactId: contact.id,
            pipelineId: defaultPipeline.id,
            stageId: firstStage.id,
            assignedToId: assignedUserId,
            totalBudget: 0,
            currency: "KZT",
          },
        });
        dealId = newDeal.id;

        // Фиксируем запись в таймлайне
        if (assignedUserId) {
          await prisma.contactNote.create({
            data: {
              contactId: contact.id,
              authorId: assignedUserId,
              content: `Автоматически создан новый контакт и сделка «${newDeal.title}» в этапе «${firstStage.name}» из входящего сообщения WhatsApp.`,
            },
          });
        }
      }
    } else {
      // Контакт существует: ищем его активную открытую сделку
      const openDeal = contact.deals.find((d) => d.stage.type === StageType.OPEN);
      if (openDeal) {
        dealId = openDeal.id;
      } else if (contact.deals.length > 0) {
        dealId = contact.deals[0].id;
      }
    }

    // 2. Сохраняем сообщение
    const message = await prisma.whatsappMessage.create({
      data: {
        instanceId,
        remoteJid: cleanPhone,
        contactId: contact.id,
        dealId,
        fromMe: false,
        senderName: payload.senderName || contact.name,
        messageType: payload.messageType || WhatsappMessageType.TEXT,
        textContent: payload.textContent || null,
        mediaUrl: payload.mediaUrl || null,
        fileName: payload.fileName || null,
        timestamp: new Date(),
      },
    });

    // 3. Запись в таймлайн
    if (assignedUserId) {
      let previewText = payload.textContent || "Вложение";
      if (payload.messageType === WhatsappMessageType.AUDIO) previewText = "Голосовое сообщение (входящее)";
      if (payload.messageType === WhatsappMessageType.IMAGE) previewText = "Изображение (входящее)";
      if (payload.messageType === WhatsappMessageType.DOCUMENT) previewText = `Документ: ${payload.fileName || "Файл"}`;

      await prisma.contactNote.create({
        data: {
          contactId: contact.id,
          authorId: assignedUserId,
          content: `WhatsApp (Входящее от ${payload.senderName || cleanPhone}): ${previewText}`,
        },
      });
    }

    revalidatePath("/whatsapp");
    revalidatePath("/contacts");
    revalidatePath("/deals");
    revalidatePath("/");

    return {
      success: true,
      contactId: contact.id,
      dealId,
      messageId: message.id,
      isNewContact,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обработки вебхука";
    return { success: false, error: message };
  }
}

// 5. Получить список всех бесед для левой колонки чатов
export async function getChatConversations(): Promise<ChatConversation[]> {
  const user = await getAuthUser();
  const isAdmin = user.role === "ADMIN";

  const messages = await prisma.whatsappMessage.findMany({
    orderBy: { timestamp: "desc" },
    include: {
      contact: {
        include: {
          deals: {
            include: { stage: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      deal: {
        include: { stage: true },
      },
    },
  });

  const convMap = new Map<string, ChatConversation>();

  for (const msg of messages) {
    if (!convMap.has(msg.remoteJid)) {
      const contact = msg.contact;
      if (!isAdmin && contact && contact.assignedToId && contact.assignedToId !== user.id) {
        continue;
      }

      const deal = msg.deal || contact?.deals?.[0] || null;

      convMap.set(msg.remoteJid, {
        remoteJid: msg.remoteJid,
        contactId: contact?.id || null,
        contactName: contact?.name || msg.senderName || msg.remoteJid,
        contactPhone: contact?.phone || msg.remoteJid,
        company: contact?.company || null,
        lastMessage: {
          textContent: msg.textContent,
          messageType: msg.messageType,
          fromMe: msg.fromMe,
          timestamp: msg.timestamp.toISOString(),
        },
        unreadCount: 0,
        deal: deal
          ? {
              id: deal.id,
              title: deal.title,
              pipelineId: deal.pipelineId,
              stageId: deal.stageId,
              stageName: deal.stage.name,
              stageColor: deal.stage.color,
              stageType: deal.stage.type,
              totalBudget: Number(deal.totalBudget),
              currency: deal.currency,
            }
          : null,
      });
    }
  }

  return Array.from(convMap.values());
}

// 6. Получить все сообщения конкретной беседы по remoteJid
export async function getChatMessages(remoteJid: string): Promise<WhatsappMessageItem[]> {
  await getAuthUser();
  const messages = await prisma.whatsappMessage.findMany({
    where: { remoteJid },
    orderBy: { timestamp: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    instanceId: m.instanceId,
    contactId: m.contactId,
    dealId: m.dealId,
    remoteJid: m.remoteJid,
    fromMe: m.fromMe,
    senderName: m.senderName,
    messageType: m.messageType,
    textContent: m.textContent,
    mediaUrl: m.mediaUrl,
    fileName: m.fileName,
    timestamp: m.timestamp.toISOString(),
    createdAt: m.createdAt.toISOString(),
  }));
}

// 7. Получить сообщения для карточки контакта
export async function getContactWhatsappMessages(contactId: string): Promise<WhatsappMessageItem[]> {
  await getAuthUser();
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });
  if (!contact) return [];

  const cleanPhone = contact.phone.replace(/[^\d+]/g, "").trim();

  const messages = await prisma.whatsappMessage.findMany({
    where: {
      OR: [
        { contactId },
        { remoteJid: cleanPhone },
        ...(cleanPhone.length >= 10 ? [{ remoteJid: { contains: cleanPhone.slice(-10) } }] : []),
      ],
    },
    orderBy: { timestamp: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    instanceId: m.instanceId,
    contactId: m.contactId,
    dealId: m.dealId,
    remoteJid: m.remoteJid,
    fromMe: m.fromMe,
    senderName: m.senderName,
    messageType: m.messageType,
    textContent: m.textContent,
    mediaUrl: m.mediaUrl,
    fileName: m.fileName,
    timestamp: m.timestamp.toISOString(),
    createdAt: m.createdAt.toISOString(),
  }));
}

// 8. Получить сообщения для карточки сделки
export async function getDealWhatsappMessages(dealId: string): Promise<WhatsappMessageItem[]> {
  await getAuthUser();
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true },
  });
  if (!deal) return [];

  const cleanPhone = deal.contact?.phone ? deal.contact.phone.replace(/[^\d+]/g, "").trim() : "";

  const messages = await prisma.whatsappMessage.findMany({
    where: {
      OR: [
        { dealId },
        ...(deal.contactId ? [{ contactId: deal.contactId }] : []),
        ...(cleanPhone ? [{ remoteJid: cleanPhone }] : []),
        ...(cleanPhone.length >= 10 ? [{ remoteJid: { contains: cleanPhone.slice(-10) } }] : []),
      ],
    },
    orderBy: { timestamp: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    instanceId: m.instanceId,
    contactId: m.contactId,
    dealId: m.dealId,
    remoteJid: m.remoteJid,
    fromMe: m.fromMe,
    senderName: m.senderName,
    messageType: m.messageType,
    textContent: m.textContent,
    mediaUrl: m.mediaUrl,
    fileName: m.fileName,
    timestamp: m.timestamp.toISOString(),
    createdAt: m.createdAt.toISOString(),
  }));
}

// 9. Смена этапа сделки прямо из боковой панели чата
export async function updateDealStageFromChat(dealId: string, stageId: string) {
  try {
    const user = await getAuthUser();
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { stage: true },
    });

    if (!deal) {
      return { success: false, error: "Сделка не найдена" };
    }

    const newStage = await prisma.stage.findUnique({
      where: { id: stageId },
    });

    if (!newStage) {
      return { success: false, error: "Этап не найден" };
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: { stageId },
    });

    if (deal.contactId) {
      await prisma.contactNote.create({
        data: {
          contactId: deal.contactId,
          authorId: user.id,
          content: `Этап сделки изменен с «${deal.stage.name}» на «${newStage.name}» через чат WhatsApp.`,
        },
      });
    }

    revalidatePath("/whatsapp");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка смены этапа";
    return { success: false, error: message };
  }
}

// 10. Получить доступные воронки и их этапы (для селектора в мини-карточке)
export async function getPipelinesForChat() {
  await getAuthUser();
  const pipelines = await prisma.pipeline.findMany({
    include: {
      stages: {
        orderBy: { order: "asc" },
      },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    stages: p.stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      type: s.type,
    })),
  }));
}
