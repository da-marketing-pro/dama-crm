"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WhatsappMessageType, WhatsappStatus, StageType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ChatConversation, WhatsappMessageItem } from "./types";
import {
  normalizeEvolutionInstanceName,
  ensureInstanceAndGetQr,
  getEvolutionStatus,
  logoutEvolutionInstance,
  sendEvolutionMessage,
} from "@/lib/evolutionApi";

function isConfiguredEvolutionGateway(
  apiUrl?: string | null,
  apiKey?: string | null
): boolean {
  const url = (apiUrl || "").trim();
  const key = (apiKey || "").trim();
  if (!url || !key) return false;
  if (url.includes("api.waha.dev") || key === "demo-waha-api-key-secure") return false;
  return true;
}

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
        name: "da-agency-main",
        phoneNumber: "",
        status: WhatsappStatus.DISCONNECTED,
        apiUrl: process.env.EVOLUTION_API_URL || "https://wa.da-marketing.pro",
        apiKey: process.env.EVOLUTION_API_KEY || "",
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
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.phoneNumber !== undefined ? { phoneNumber: data.phoneNumber.trim() } : {}),
        ...(data.apiUrl !== undefined ? { apiUrl: data.apiUrl.trim() } : {}),
        ...(data.apiKey !== undefined ? { apiKey: data.apiKey.trim() } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");
    return { success: true, instance: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления настроек";
    return { success: false, error: message };
  }
}

// 2.1 Запросить реальный QR-код у Evolution API (с автосозданием инстанса и настройкой Webhook)
export async function requestWhatsappQrCode(params: {
  instanceId: string;
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  webhookUrl?: string;
}) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Подключение WhatsApp доступно только Администратору" };
    }

    let instance = await prisma.whatsappInstance.findUnique({
      where: { id: params.instanceId },
    });
    if (!instance) {
      return { success: false, error: "Инстанс WhatsApp не найден" };
    }

    const nextName = params.name?.trim() || instance.name;
    const nextApiUrl = params.apiUrl !== undefined ? params.apiUrl.trim() : instance.apiUrl || "";
    const nextApiKey = params.apiKey !== undefined ? params.apiKey.trim() : instance.apiKey || "";

    if (!nextApiUrl || nextApiUrl.includes("api.waha.dev")) {
      return {
        success: false,
        error: "Укажите реальный URL Evolution API (например, https://wa.da-marketing.pro)",
      };
    }
    if (!nextApiKey || nextApiKey === "demo-waha-api-key-secure") {
      return {
        success: false,
        error: "Укажите действующий API Ключ (AUTHENTICATION_API_KEY) вашего сервера Evolution API",
      };
    }

    // Сохраняем актуальные поля перед обращением к шлюзу
    instance = await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        name: nextName,
        apiUrl: nextApiUrl,
        apiKey: nextApiKey,
      },
    });

    const instanceName = normalizeEvolutionInstanceName(instance.name, instance.id);
    const evoResult = await ensureInstanceAndGetQr({
      apiUrl: nextApiUrl,
      apiKey: nextApiKey,
      instanceName,
      webhookUrl: params.webhookUrl,
    });

    if (!evoResult.success) {
      return {
        success: false,
        error: evoResult.error || "Не удалось получить QR-код",
      };
    }

    const nextStatus = evoResult.connected
      ? WhatsappStatus.CONNECTED
      : WhatsappStatus.QR_READY;

    const updated = await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        status: nextStatus,
        ...(evoResult.phoneNumber ? { phoneNumber: evoResult.phoneNumber } : {}),
      },
    });

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");

    return {
      success: true,
      connected: Boolean(evoResult.connected),
      qrBase64: evoResult.qrBase64 || null,
      pairingCode: evoResult.pairingCode || null,
      status: updated.status,
      phoneNumber: updated.phoneNumber,
      instanceName,
      webhookConfigured: Boolean(evoResult.webhookConfigured),
      webhookError: evoResult.webhookError,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка получения QR-кода";
    return { success: false, error: message };
  }
}

// 2.2 Проверка реального статуса подключения в Evolution API
export async function checkWhatsappConnectionState(instanceId: string) {
  try {
    await getAuthUser();
    const instance = await prisma.whatsappInstance.findUnique({
      where: { id: instanceId },
    });
    if (!instance) {
      return { ok: false, status: WhatsappStatus.DISCONNECTED, phoneNumber: null, error: "Инстанс не найден" };
    }

    if (!isConfiguredEvolutionGateway(instance.apiUrl, instance.apiKey)) {
      return {
        ok: false,
        status: instance.status,
        phoneNumber: instance.phoneNumber,
        error: "Не указан URL или API-ключ Evolution API",
      };
    }

    const instanceName = normalizeEvolutionInstanceName(instance.name, instance.id);
    const evoStatus = await getEvolutionStatus({
      apiUrl: instance.apiUrl!,
      apiKey: instance.apiKey!,
      instanceName,
    });

    if (!evoStatus.ok) {
      return {
        ok: false,
        status: instance.status,
        phoneNumber: instance.phoneNumber,
        error: evoStatus.error,
      };
    }

    let nextStatus = instance.status;
    if (evoStatus.state === "open") {
      nextStatus = WhatsappStatus.CONNECTED;
    } else if (evoStatus.state === "close" || evoStatus.state === "not_found") {
      nextStatus = WhatsappStatus.DISCONNECTED;
    }

    const nextPhone = evoStatus.phoneNumber || instance.phoneNumber;

    if (nextStatus !== instance.status || (evoStatus.phoneNumber && evoStatus.phoneNumber !== instance.phoneNumber)) {
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: nextStatus,
          ...(evoStatus.phoneNumber ? { phoneNumber: evoStatus.phoneNumber } : {}),
        },
      });
      revalidatePath("/settings/whatsapp");
      revalidatePath("/whatsapp");
    }

    return {
      ok: true,
      state: evoStatus.state,
      status: nextStatus,
      phoneNumber: nextPhone,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка проверки статуса";
    return { ok: false, status: WhatsappStatus.DISCONNECTED, phoneNumber: null, error: message };
  }
}

// 2.3 Отключение номера от WhatsApp Web
export async function disconnectWhatsappInstance(instanceId: string) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Настройка WhatsApp доступна только Администратору" };
    }

    const instance = await prisma.whatsappInstance.findUnique({
      where: { id: instanceId },
    });
    if (!instance) {
      return { success: false, error: "Инстанс не найден" };
    }

    if (isConfiguredEvolutionGateway(instance.apiUrl, instance.apiKey)) {
      const instanceName = normalizeEvolutionInstanceName(instance.name, instance.id);
      await logoutEvolutionInstance({
        apiUrl: instance.apiUrl!,
        apiKey: instance.apiKey!,
        instanceName,
      });
    }

    const updated = await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: { status: WhatsappStatus.DISCONNECTED },
    });

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");
    return { success: true, instance: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка отключения";
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

    const instance = data.instanceId
      ? await prisma.whatsappInstance.findUnique({ where: { id: data.instanceId } })
      : await getOrCreateDefaultInstance();

    if (!instance) {
      return { success: false, error: "Инстанс WhatsApp не найден" };
    }

    if (isConfiguredEvolutionGateway(instance.apiUrl, instance.apiKey)) {
      const instanceName = normalizeEvolutionInstanceName(instance.name, instance.id);
      const sendRes = await sendEvolutionMessage({
        apiUrl: instance.apiUrl!,
        apiKey: instance.apiKey!,
        instanceName,
        to: data.remoteJid,
        messageType: data.messageType,
        textContent: data.textContent,
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
      });

      if (!sendRes.ok) {
        return {
          success: false,
          error: sendRes.error || "Не удалось доставить сообщение через Evolution API",
        };
      }

      if (instance.status !== WhatsappStatus.CONNECTED) {
        await prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: { status: WhatsappStatus.CONNECTED },
        });
      }
    }

    // Сохраняем исходящее сообщение
    const message = await prisma.whatsappMessage.create({
      data: {
        instanceId: instance.id,
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
  rawRemoteJid?: string;
  senderName?: string;
  messageType?: WhatsappMessageType;
  textContent?: string;
  mediaUrl?: string;
  fileName?: string;
  instanceId?: string;
}) {
  try {
    const rawIdentifier = (payload.phone || "").trim();
    const digits = rawIdentifier.split("@")[0].split(":")[0].replace(/\D/g, "");
    const isLidWithoutPhone = Boolean(payload.rawRemoteJid?.endsWith("@lid") && !digits);
    const cleanPhone = isLidWithoutPhone
      ? payload.rawRemoteJid!
      : digits
      ? `+${digits}`
      : rawIdentifier.replace(/[^\d+]/g, "").trim();

    if (!cleanPhone) {
      return { success: false, error: "Номер телефона не указан" };
    }

    let instanceId = payload.instanceId;
    if (!instanceId) {
      const defaultInst = await getOrCreateDefaultInstance();
      instanceId = defaultInst.id;
    }

    // 1. Проверяем, существует ли контакт (с учетом любого форматирования номера в CRM)
    const last10 = digits.length >= 10 ? digits.slice(-10) : cleanPhone.slice(-10);
    let contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          ...(last10.length >= 7 ? [{ phone: { contains: last10 } }] : []),
        ],
      },
      include: {
        deals: {
          include: { stage: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!contact && digits.length >= 10) {
      const allContacts = await prisma.contact.findMany({
        select: { id: true, phone: true },
      });
      const matched = allContacts.find(
        (c) => c.phone.replace(/\D/g, "").slice(-10) === digits.slice(-10)
      );
      if (matched) {
        contact = await prisma.contact.findUnique({
          where: { id: matched.id },
          include: {
            deals: {
              include: { stage: true },
              orderBy: { createdAt: "desc" },
            },
          },
        });
      }
    }

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
