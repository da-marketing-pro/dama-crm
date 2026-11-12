"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Currency, WhatsappMessageType, WhatsappStatus, StageType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  ChatConversation,
  WhatsappMessageItem,
  WhatsappFilteringData,
  EvolutionSyncedChatItem,
  WhatsappLabelItem,
} from "./types";
import {
  normalizeEvolutionInstanceName,
  ensureInstanceAndGetQr,
  getEvolutionStatus,
  logoutEvolutionInstance,
  sendEvolutionMessage,
  setEvolutionWebhook,
  fetchEvolutionChats,
  fetchEvolutionLabels,
} from "@/lib/evolutionApi";
import {
  DEFAULT_IGNORED_LABEL_NAMES,
  extractPhoneKeyAndRaw,
  LeadFilterMode,
  matchesLeadKeywords,
  normalizeJsonStringArray,
  normalizeLeadFilterMode,
  parseBulkPhonesInput,
  resolveEffectiveIgnoredLabels,
} from "@/lib/whatsappFilterUtils";
import {
  checkWhatsappNumberIgnored,
  loadIgnoredPhoneKeySets,
  matchesIgnoredKeySets,
  safeCleanupAutoCreatedLead,
  upsertIgnoredWhatsappNumber,
} from "@/lib/whatsappFiltering";
import {
  normalizeQuickTemplates,
  WhatsappQuickTemplate,
} from "@/lib/whatsappTemplates";
import { processCalloLeadWebhook } from "@/lib/calloWebhook";

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
  forceReset?: boolean;
  pairingPhone?: string;
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

    const requestStartedAt = new Date();

    // Сохраняем актуальные поля перед обращением к шлюзу и сбрасываем устаревший кэш QR
    instance = await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        name: nextName,
        apiUrl: nextApiUrl,
        apiKey: nextApiKey,
        lastQrCode: null,
        lastPairingCode: null,
        lastQrUpdatedAt: null,
      },
    });

    const instanceName = normalizeEvolutionInstanceName(instance.name, instance.id);
    const evoResult = await ensureInstanceAndGetQr({
      apiUrl: nextApiUrl,
      apiKey: nextApiKey,
      instanceName,
      webhookUrl: params.webhookUrl,
      forceReset: params.forceReset,
      pairingPhone: params.pairingPhone,
    });

    if (!evoResult.success) {
      return {
        success: false,
        error: evoResult.error || "Не удалось получить QR-код",
      };
    }

    let resolvedQrBase64 = evoResult.qrBase64 || null;
    let resolvedPairingCode = evoResult.pairingCode || null;

    if (!evoResult.connected && !resolvedQrBase64 && !resolvedPairingCode) {
      const freshInstance = await prisma.whatsappInstance.findUnique({
        where: { id: instance.id },
        select: { lastQrCode: true, lastPairingCode: true, lastQrUpdatedAt: true },
      });
      if (
        (freshInstance?.lastQrCode || freshInstance?.lastPairingCode) &&
        freshInstance.lastQrUpdatedAt &&
        freshInstance.lastQrUpdatedAt >= requestStartedAt
      ) {
        resolvedQrBase64 = freshInstance.lastQrCode;
        resolvedPairingCode = freshInstance.lastPairingCode;
      }
    }

    const nextStatus = evoResult.connected
      ? WhatsappStatus.CONNECTED
      : WhatsappStatus.QR_READY;

    const updated = await prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        status: nextStatus,
        ...(evoResult.connected
          ? { lastQrCode: null, lastPairingCode: null, lastQrUpdatedAt: null }
          : {}),
        ...(evoResult.phoneNumber ? { phoneNumber: evoResult.phoneNumber } : {}),
      },
    });

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");

    return {
      success: true,
      connected: Boolean(evoResult.connected),
      qrBase64: resolvedQrBase64,
      pairingCode: resolvedPairingCode,
      awaitingWebhook: Boolean(
        !evoResult.connected &&
          !resolvedQrBase64 &&
          !resolvedPairingCode &&
          evoResult.awaitingWebhook
      ),
      diagnostic: evoResult.diagnostic,
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

    if (
      nextStatus !== instance.status ||
      (evoStatus.state === "open" && instance.lastQrCode) ||
      (evoStatus.phoneNumber && evoStatus.phoneNumber !== instance.phoneNumber)
    ) {
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: {
          status: nextStatus,
          ...(evoStatus.state === "open"
            ? { lastQrCode: null, lastPairingCode: null, lastQrUpdatedAt: null }
            : {}),
          ...(evoStatus.phoneNumber ? { phoneNumber: evoStatus.phoneNumber } : {}),
        },
      });
      revalidatePath("/settings/whatsapp");
      revalidatePath("/whatsapp");
    }

    const hasFreshQr = Boolean(
      evoStatus.state !== "open" &&
        (instance.lastQrCode || instance.lastPairingCode) &&
        instance.lastQrUpdatedAt &&
        Date.now() - instance.lastQrUpdatedAt.getTime() < 90_000
    );

    return {
      ok: true,
      state: evoStatus.state,
      status: nextStatus,
      phoneNumber: nextPhone,
      qrBase64: hasFreshQr ? instance.lastQrCode : null,
      pairingCode: hasFreshQr ? instance.lastPairingCode : null,
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

    // Сохраняем исходящее сообщение под каноническим remoteJid (+7...), как и входящие вебхуки
    const parsedOutJid = extractPhoneKeyAndRaw(data.remoteJid);
    const storedRemoteJid = parsedOutJid?.rawDisplay || data.remoteJid;

    let resolvedContactId = data.contactId || null;
    let resolvedDealId = data.dealId || null;

    if (!resolvedContactId && parsedOutJid && !parsedOutJid.isLid && parsedOutJid.last10.length >= 10) {
      const matchedContact = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: storedRemoteJid },
            { phone: { contains: parsedOutJid.last10 } },
          ],
        },
        include: {
          deals: {
            include: { stage: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (matchedContact) {
        resolvedContactId = matchedContact.id;
        if (!resolvedDealId && matchedContact.deals.length > 0) {
          const openDeal = matchedContact.deals.find((d) => d.stage.type === StageType.OPEN);
          resolvedDealId = openDeal?.id || matchedContact.deals[0].id;
        }
      }
    }

    const message = await prisma.whatsappMessage.create({
      data: {
        instanceId: instance.id,
        remoteJid: storedRemoteJid,
        contactId: resolvedContactId,
        dealId: resolvedDealId,
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
    if (resolvedContactId) {
      let previewText = data.textContent || "Вложение";
      if (data.messageType === WhatsappMessageType.AUDIO) previewText = "Голосовое сообщение (исходящее)";
      if (data.messageType === WhatsappMessageType.IMAGE) previewText = "Изображение (исходящее)";
      if (data.messageType === WhatsappMessageType.DOCUMENT) previewText = `Документ: ${data.fileName || "Файл"}`;

      await prisma.contactNote.create({
        data: {
          contactId: resolvedContactId,
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
  isFromAd?: boolean;
  fromMe?: boolean;
}) {
  try {
    const normalizedPhone = extractPhoneKeyAndRaw(payload.phone, payload.rawRemoteJid);
    if (!normalizedPhone) {
      return { success: false, error: "Номер телефона не указан" };
    }

    const cleanPhone = normalizedPhone.rawDisplay;
    const digits = normalizedPhone.isLid ? "" : normalizedPhone.phoneKey;

    const instance = payload.instanceId
      ? await prisma.whatsappInstance.findUnique({ where: { id: payload.instanceId } })
      : await getOrCreateDefaultInstance();

    if (!instance) {
      return { success: false, error: "Инстанс WhatsApp не найден" };
    }
    const instanceId = instance.id;

    // 0. Проверяем стоп-лист (Вариант 1 + Вариант 2 + ярлыки WhatsApp Business из Варианта 4)
    const ignoreCheck = await checkWhatsappNumberIgnored(payload.phone, payload.rawRemoteJid);
    if (ignoreCheck.ignored) {
      return {
        success: true,
        ignored: true,
        reason: ignoreCheck.reason || "ignored_number",
      };
    }

    // 1. Проверяем, существует ли контакт (с учетом любого форматирования номера в CRM)
    const last10 = normalizedPhone.last10;
    let contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          ...(last10.length >= 10 ? [{ phone: { contains: last10 } }] : []),
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
      const matched = allContacts.find((c) => {
        const parsed = extractPhoneKeyAndRaw(c.phone);
        return (
          parsed?.phoneKey === normalizedPhone.phoneKey ||
          (parsed?.last10 && parsed.last10 === last10)
        );
      });
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
      // Исходящие сообщения с телефона/WhatsApp Web на незнакомые номера не должны создавать лиды
      if (payload.fromMe) {
        return {
          success: true,
          ignored: true,
          reason: "from_me_unknown_contact",
        };
      }

      // Фильтр Варианта 4: незнакомые номера создают лид только с рекламы / ключевых слов
      const filterMode = normalizeLeadFilterMode(instance.leadFilterMode);
      if (filterMode === "ONLY_ADS_OR_KEYWORDS") {
        const keywords = normalizeJsonStringArray(instance.leadKeywords);
        const keywordMatched = matchesLeadKeywords(payload.textContent, keywords);
        if (!payload.isFromAd && !keywordMatched) {
          return {
            success: true,
            ignored: true,
            reason: "lead_filter_no_ad_or_keyword",
          };
        }
      }

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
          const adTag = payload.isFromAd ? " Источник: реклама Click-to-WhatsApp." : "";
          await prisma.contactNote.create({
            data: {
              contactId: contact.id,
              authorId: assignedUserId,
              content: `Автоматически создан новый контакт и сделка «${newDeal.title}» в этапе «${firstStage.name}» из входящего сообщения WhatsApp.${adTag}`,
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

    const msgType = payload.messageType || WhatsappMessageType.TEXT;
    const isFromMe = payload.fromMe === true;

    // Если это исходящее сообщение (fromMe), проверяем, не было ли оно только что сохранено самой CRM
    if (isFromMe) {
      const dedupWindowStart = new Date(Date.now() - 90_000);
      const recentDuplicate = await prisma.whatsappMessage.findFirst({
        where: {
          fromMe: true,
          messageType: msgType,
          timestamp: { gte: dedupWindowStart },
          ...(payload.textContent?.trim() ? { textContent: payload.textContent.trim() } : {}),
          OR: [
            { contactId: contact.id },
            { remoteJid: cleanPhone },
            { remoteJid: normalizedPhone.phoneKey },
          ],
        },
        select: { id: true },
      });

      if (recentDuplicate) {
        return {
          success: true,
          ignored: true,
          reason: "from_me_already_saved",
          contactId: contact.id,
          dealId,
          messageId: recentDuplicate.id,
        };
      }
    }

    // 2. Сохраняем сообщение
    const message = await prisma.whatsappMessage.create({
      data: {
        instanceId,
        remoteJid: cleanPhone,
        contactId: contact.id,
        dealId,
        fromMe: isFromMe,
        senderName: isFromMe
          ? "WhatsApp (телефон)"
          : payload.senderName || contact.name,
        messageType: msgType,
        textContent: payload.textContent || null,
        mediaUrl: payload.mediaUrl || null,
        fileName: payload.fileName || null,
        timestamp: new Date(),
      },
    });

    // 3. Запись в таймлайн
    if (assignedUserId) {
      let previewText = payload.textContent || "Вложение";
      if (msgType === WhatsappMessageType.AUDIO) {
        previewText = isFromMe ? "Голосовое сообщение (с телефона)" : "Голосовое сообщение (входящее)";
      }
      if (msgType === WhatsappMessageType.IMAGE) {
        previewText = isFromMe ? "Изображение (с телефона)" : "Изображение (входящее)";
      }
      if (msgType === WhatsappMessageType.DOCUMENT) {
        previewText = `Документ: ${payload.fileName || "Файл"}`;
      }

      await prisma.contactNote.create({
        data: {
          contactId: contact.id,
          authorId: assignedUserId,
          content: isFromMe
            ? `WhatsApp (Исходящее с телефона): ${previewText}`
            : `WhatsApp (Входящее от ${payload.senderName || cleanPhone}): ${previewText}`,
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

  const [messages, ignoredSets] = await Promise.all([
    prisma.whatsappMessage.findMany({
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
    }),
    loadIgnoredPhoneKeySets(),
  ]);

  const convMap = new Map<string, ChatConversation>();

  for (const msg of messages) {
    if (
      matchesIgnoredKeySets(msg.remoteJid, ignoredSets) ||
      matchesIgnoredKeySets(msg.contact?.phone, ignoredSets)
    ) {
      continue;
    }

    const contact = msg.contact;
    if (!isAdmin && contact && contact.assignedToId && contact.assignedToId !== user.id) {
      continue;
    }

    const parsedJid = extractPhoneKeyAndRaw(msg.remoteJid, contact?.phone);
    const canonicalJid = parsedJid?.rawDisplay || msg.remoteJid;
    const convKey =
      parsedJid && !parsedJid.isLid
        ? `phone:${parsedJid.phoneKey}`
        : msg.contactId
        ? `contact:${msg.contactId}`
        : parsedJid
        ? `phone:${parsedJid.phoneKey}`
        : `raw:${msg.remoteJid}`;

    const deal = msg.deal || contact?.deals?.[0] || null;
    const existing = convMap.get(convKey);

    if (!existing) {
      convMap.set(convKey, {
        remoteJid: canonicalJid,
        contactId: contact?.id || null,
        contactName:
          contact?.name ||
          (!msg.fromMe ? msg.senderName : null) ||
          canonicalJid,
        contactPhone: contact?.phone || canonicalJid,
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
    } else {
      // Дозаполняем данные контакта/сделки из более старых сообщений того же диалога, если у последнего сообщения они не были привязаны
      if (!existing.contactId && contact) {
        existing.contactId = contact.id;
        existing.contactName = contact.name;
        existing.contactPhone = contact.phone;
        existing.company = contact.company;
      }
      if (!existing.deal && deal) {
        existing.deal = {
          id: deal.id,
          title: deal.title,
          pipelineId: deal.pipelineId,
          stageId: deal.stageId,
          stageName: deal.stage.name,
          stageColor: deal.stage.color,
          stageType: deal.stage.type,
          totalBudget: Number(deal.totalBudget),
          currency: deal.currency,
        };
      }
    }
  }

  return Array.from(convMap.values());
}

// 6. Получить все сообщения конкретной беседы по каноническому remoteJid (склейка +7..., 7..., @s.whatsapp.net)
export async function getChatMessages(remoteJid: string): Promise<WhatsappMessageItem[]> {
  await getAuthUser();
  const parsed = extractPhoneKeyAndRaw(remoteJid);
  const candidateJids = Array.from(
    new Set(
      [
        remoteJid,
        parsed?.rawDisplay,
        parsed?.phoneKey,
        parsed && !parsed.isLid ? `${parsed.phoneKey}@s.whatsapp.net` : undefined,
      ].filter((v): v is string => Boolean(v))
    )
  );

  const messages = await prisma.whatsappMessage.findMany({
    where: {
      OR: [
        ...candidateJids.map((jid) => ({ remoteJid: jid })),
        ...(parsed && !parsed.isLid && parsed.last10.length >= 10
          ? [
              { remoteJid: { contains: parsed.last10 } },
              { contact: { phone: { contains: parsed.last10 } } },
            ]
          : []),
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

function parseCachedLabelsJson(val: Prisma.JsonValue | null | undefined): WhatsappLabelItem[] {
  if (!Array.isArray(val)) return [];
  const items: WhatsappLabelItem[] = [];
  for (const item of val) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (obj.id != null && typeof obj.name === "string" && obj.name.trim()) {
      items.push({
        id: String(obj.id),
        name: obj.name.trim(),
        color: obj.color != null ? String(obj.color) : undefined,
      });
    }
  }
  return items;
}

// 11. Получить настройки фильтрации и список исключений (Вариант 1 + 2 + 4)
export async function getWhatsappFilteringData(
  instanceId: string
): Promise<WhatsappFilteringData> {
  const user = await getAuthUser();
  if (user.role !== "ADMIN") {
    return {
      leadFilterMode: "ALL_EXCEPT_IGNORED",
      ignoredLabelNames: [...DEFAULT_IGNORED_LABEL_NAMES],
      leadKeywords: [],
      cachedLabels: [],
      ignoredNumbers: [],
    };
  }

  const [instance, ignoredRows] = await Promise.all([
    prisma.whatsappInstance.findUnique({ where: { id: instanceId } }),
    prisma.whatsappIgnoredNumber.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    leadFilterMode: normalizeLeadFilterMode(instance?.leadFilterMode),
    ignoredLabelNames: resolveEffectiveIgnoredLabels(instance?.ignoredLabelNames),
    leadKeywords: normalizeJsonStringArray(instance?.leadKeywords),
    cachedLabels: parseCachedLabelsJson(instance?.cachedLabels),
    ignoredNumbers: ignoredRows.map((row) => ({
      id: row.id,
      phoneKey: row.phoneKey,
      rawPhone: row.rawPhone,
      displayName: row.displayName,
      reason: row.reason,
      source: row.source,
      labelId: row.labelId,
      labelName: row.labelName,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

// 12. Сохранить правила фильтрации и стоп-ярлыки
export async function updateWhatsappFilterSettings(
  instanceId: string,
  data: {
    leadFilterMode: LeadFilterMode;
    ignoredLabelNames: string[];
    leadKeywords: string[];
  }
) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Настройки фильтрации доступны только Администратору" };
    }

    const cleanedLabels = Array.from(
      new Set(data.ignoredLabelNames.map((s) => s.trim()).filter(Boolean))
    );
    const cleanedKeywords = Array.from(
      new Set(data.leadKeywords.map((s) => s.trim().toLowerCase()).filter(Boolean))
    );

    await prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: {
        leadFilterMode: normalizeLeadFilterMode(data.leadFilterMode),
        ignoredLabelNames: cleanedLabels as unknown as Prisma.InputJsonValue,
        leadKeywords: cleanedKeywords as unknown as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения правил фильтрации";
    return { success: false, error: message };
  }
}

// 13. Синхронизировать события вебхука на Evolution API (без переподключения QR)
export async function syncEvolutionWebhookNow(instanceId: string, webhookUrl: string) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Доступно только Администратору" };
    }

    const instance = await prisma.whatsappInstance.findUnique({ where: { id: instanceId } });
    if (!instance || !isConfiguredEvolutionGateway(instance.apiUrl, instance.apiKey)) {
      return {
        success: false,
        error: "Сначала сохраните URL шлюза и API Ключ Evolution API",
      };
    }

    const evoName = normalizeEvolutionInstanceName(instance.name, instance.id);
    const res = await setEvolutionWebhook({
      apiUrl: instance.apiUrl!,
      apiKey: instance.apiKey!,
      instanceName: evoName,
      webhookUrl,
    });

    if (!res.ok) {
      return { success: false, error: res.error || "Не удалось обновить Webhook на шлюзе" };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления вебхука";
    return { success: false, error: message };
  }
}

// 14. Добавить номера в стоп-лист (вручную списком или из выбранных чатов Evolution API)
export async function addIgnoredWhatsappNumbers(params: {
  instanceId: string;
  rawText?: string;
  reason?: string;
  items?: Array<{
    phone: string;
    displayName?: string | null;
    reason?: string | null;
    source?: string;
  }>;
}) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Управление стоп-листом доступно только Администратору" };
    }

    let addedCount = 0;

    if (params.rawText && params.rawText.trim()) {
      const parsedItems = parseBulkPhonesInput(params.rawText);
      for (const entry of parsedItems) {
        const res = await upsertIgnoredWhatsappNumber({
          instanceId: params.instanceId,
          rawPhone: entry.rawDisplay,
          reason: params.reason?.trim() || "Добавлено вручную в стоп-лист",
          source: "MANUAL",
        });
        if (res) addedCount++;
      }
    }

    if (Array.isArray(params.items)) {
      for (const item of params.items) {
        if (!item.phone) continue;
        const res = await upsertIgnoredWhatsappNumber({
          instanceId: params.instanceId,
          rawPhone: item.phone,
          displayName: item.displayName || null,
          reason: item.reason || params.reason || "Рабочий чат / текущий клиент",
          source: item.source || "CHAT_SYNC",
        });
        if (res) addedCount++;
      }
    }

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");
    return { success: true, addedCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка добавления в стоп-лист";
    return { success: false, error: message };
  }
}

// 15. Удалить номер из стоп-листа
export async function removeIgnoredWhatsappNumber(id: string) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Доступно только Администратору" };
    }

    await prisma.whatsappIgnoredNumber.delete({ where: { id } });
    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления из стоп-листа";
    return { success: false, error: message };
  }
}

// 16. Загрузить текущие диалоги и ярлыки WhatsApp Business из Evolution API (Варианты 2 и 4)
export async function fetchWhatsappChatsAndLabelsFromGateway(instanceId: string): Promise<{
  success: boolean;
  chats: EvolutionSyncedChatItem[];
  labels: WhatsappLabelItem[];
  chatsError?: string;
  labelsError?: string;
  error?: string;
}> {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, chats: [], labels: [], error: "Доступно только Администратору" };
    }

    const instance = await prisma.whatsappInstance.findUnique({ where: { id: instanceId } });
    if (!instance || !isConfiguredEvolutionGateway(instance.apiUrl, instance.apiKey)) {
      return {
        success: false,
        chats: [],
        labels: [],
        error: "Шлюз Evolution API не настроен или не сохранен API Ключ",
      };
    }

    const evoName = normalizeEvolutionInstanceName(instance.name, instance.id);

    const [chatsRes, labelsRes, ignoredSets, contacts] = await Promise.all([
      fetchEvolutionChats({
        apiUrl: instance.apiUrl!,
        apiKey: instance.apiKey!,
        instanceName: evoName,
      }),
      fetchEvolutionLabels({
        apiUrl: instance.apiUrl!,
        apiKey: instance.apiKey!,
        instanceName: evoName,
      }),
      loadIgnoredPhoneKeySets(),
      prisma.contact.findMany({ select: { id: true, name: true, phone: true } }),
    ]);

    const cachedLabels = parseCachedLabelsJson(instance.cachedLabels);
    const effectiveLabels = labelsRes.ok && labelsRes.labels.length > 0 ? labelsRes.labels : cachedLabels;
    const labelNameById = new Map<string, string>();
    for (const lbl of effectiveLabels) {
      labelNameById.set(lbl.id, lbl.name);
    }

    if (labelsRes.ok) {
      await prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { cachedLabels: labelsRes.labels as unknown as Prisma.InputJsonValue },
      });
      revalidatePath("/settings/whatsapp");
    }

    const contactByKey = new Map<string, string>();
    for (const c of contacts) {
      const parsed = extractPhoneKeyAndRaw(c.phone);
      if (!parsed) continue;
      contactByKey.set(parsed.phoneKey, c.name);
      if (parsed.last10) contactByKey.set(parsed.last10, c.name);
    }

    const chats: EvolutionSyncedChatItem[] = chatsRes.chats.map((chat) => {
      const parsed = extractPhoneKeyAndRaw(chat.phone, chat.jid);
      const isAlreadyIgnored =
        matchesIgnoredKeySets(chat.phone, ignoredSets) ||
        matchesIgnoredKeySets(chat.jid, ignoredSets);
      const existingContactName = parsed
        ? contactByKey.get(parsed.phoneKey) ||
          (parsed.last10 ? contactByKey.get(parsed.last10) : undefined) ||
          null
        : null;
      const resolvedLabels = Array.from(
        new Set(chat.labels.map((l) => labelNameById.get(l) || l).filter(Boolean))
      );

      return {
        jid: chat.jid,
        phone: chat.phone,
        phoneKey: parsed?.phoneKey || chat.jid,
        displayName: chat.displayName,
        lastMessageText: chat.lastMessageText,
        lastMessageAt: chat.lastMessageAt,
        archived: chat.archived,
        labels: resolvedLabels,
        isAlreadyIgnored,
        existingContactName,
      };
    });

    return {
      success: chatsRes.ok || labelsRes.ok,
      chats,
      labels: labelsRes.labels,
      chatsError: chatsRes.ok ? undefined : chatsRes.error,
      labelsError: labelsRes.ok ? undefined : labelsRes.error,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обращения к шлюзу Evolution API";
    return { success: false, chats: [], labels: [], error: message };
  }
}

// 17. Пометить диалог в 1 клик как «Рабочий чат (не лид)» (Вариант 1)
export async function markConversationAsWorkChat(params: {
  remoteJid: string;
  contactId?: string | null;
  displayName?: string | null;
  reason?: string;
  deleteAutoCreatedLead?: boolean;
}) {
  try {
    const user = await getAuthUser();
    const isAdmin = user.role === "ADMIN";

    if (params.contactId && !isAdmin) {
      const contact = await prisma.contact.findUnique({
        where: { id: params.contactId },
        select: { assignedToId: true },
      });
      if (contact?.assignedToId && contact.assignedToId !== user.id) {
        return { success: false, error: "Нет прав на управление этим диалогом" };
      }
    }

    const defaultInst = await getOrCreateDefaultInstance();

    await upsertIgnoredWhatsappNumber({
      instanceId: defaultInst.id,
      rawPhone: params.remoteJid,
      displayName: params.displayName || null,
      reason: params.reason?.trim() || "Рабочий чат (отмечено в диалоге)",
      source: "UI_BUTTON",
    });

    let cleanup = { deletedDealsCount: 0, deletedContact: false };
    if (params.deleteAutoCreatedLead) {
      cleanup = await safeCleanupAutoCreatedLead({
        phoneOrJid: params.remoteJid,
        contactId: params.contactId,
      });
    }

    revalidatePath("/whatsapp");
    revalidatePath("/settings/whatsapp");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");

    return {
      success: true,
      deletedDealsCount: cleanup.deletedDealsCount,
      deletedContact: cleanup.deletedContact,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка переноса в рабочие чаты";
    return { success: false, error: message };
  }
}

// 18. Импорт текущих чатов WhatsApp в Контакты и Сделки (включая автосоздание по ярлыку «Лид»)
export async function importWhatsappLeadChatsToCrm(params: {
  instanceId: string;
  chats: Array<{
    jid: string;
    phone: string;
    displayName: string;
    lastMessageText?: string | null;
    lastMessageAt?: string | null;
    labels: string[];
  }>;
  targetPipelineId?: string;
  targetStageId?: string;
  dealCreationRule: "LEAD_LABEL_ONLY" | "ALL_SELECTED";
  leadLabelName?: string;
}) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Импорт чатов в CRM доступен только Администратору" };
    }

    if (!Array.isArray(params.chats) || params.chats.length === 0) {
      return { success: false, error: "Выберите хотя бы один чат для импорта" };
    }

    const pipelines = await prisma.pipeline.findMany({
      include: {
        stages: { orderBy: { order: "asc" } },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    const targetPipeline =
      (params.targetPipelineId && pipelines.find((p) => p.id === params.targetPipelineId)) ||
      pipelines.find((p) => p.name.toLowerCase().includes("холодный автообзвон")) ||
      pipelines.find((p) => p.isDefault) ||
      pipelines[0];

    if (!targetPipeline || targetPipeline.stages.length === 0) {
      return { success: false, error: "В CRM не найдена воронка с этапами для создания сделок" };
    }

    const targetStage =
      (params.targetStageId && targetPipeline.stages.find((s) => s.id === params.targetStageId)) ||
      targetPipeline.stages.find((s) => s.name.toLowerCase().includes("неразобран")) ||
      targetPipeline.stages.find((s) => s.type === StageType.OPEN) ||
      targetPipeline.stages[0];

    const targetLeadLabelLower = (params.leadLabelName || "Лид").trim().toLowerCase();

    const [ignoredSets, existingContacts, existingMessagesContacts] = await Promise.all([
      loadIgnoredPhoneKeySets(),
      prisma.contact.findMany({
        include: {
          deals: {
            select: { id: true, pipelineId: true },
          },
        },
      }),
      prisma.whatsappMessage.findMany({
        where: { contactId: { not: null } },
        distinct: ["contactId"],
        select: { contactId: true },
      }),
    ]);

    const contactByKey = new Map<
      string,
      { id: string; name: string; dealPipelineIds: Set<string> }
    >();
    for (const c of existingContacts) {
      const entry = {
        id: c.id,
        name: c.name,
        dealPipelineIds: new Set(c.deals.map((d) => d.pipelineId)),
      };
      const parsed = extractPhoneKeyAndRaw(c.phone);
      if (parsed) {
        contactByKey.set(parsed.phoneKey, entry);
        if (parsed.last10) contactByKey.set(parsed.last10, entry);
      }
      contactByKey.set(c.phone, entry);
    }

    const contactsWithMessages = new Set(
      existingMessagesContacts.map((m) => m.contactId).filter((id): id is string => Boolean(id))
    );

    let createdContactsCount = 0;
    let existingContactsCount = 0;
    let createdDealsCount = 0;
    let skippedIgnoredCount = 0;
    let skippedExistingDealsCount = 0;

    for (const chat of params.chats) {
      const isIgnored =
        matchesIgnoredKeySets(chat.phone, ignoredSets) ||
        matchesIgnoredKeySets(chat.jid, ignoredSets);
      if (isIgnored) {
        skippedIgnoredCount++;
        continue;
      }

      const parsed = extractPhoneKeyAndRaw(chat.phone, chat.jid);
      const displayPhone = parsed
        ? parsed.isLid
          ? chat.phone || chat.jid
          : parsed.phoneKey.length >= 10
          ? `+${parsed.phoneKey}`
          : chat.phone || parsed.phoneKey
        : chat.phone || chat.jid;

      if (!displayPhone) continue;

      const cleanName =
        chat.displayName && chat.displayName.trim() ? chat.displayName.trim() : displayPhone;

      let contactEntry =
        (parsed && contactByKey.get(parsed.phoneKey)) ||
        (parsed?.last10 ? contactByKey.get(parsed.last10) : undefined) ||
        contactByKey.get(displayPhone);

      if (!contactEntry) {
        const createdContact = await prisma.contact.create({
          data: {
            name: cleanName,
            phone: displayPhone,
            assignedToId: user.id,
          },
        });
        contactEntry = {
          id: createdContact.id,
          name: createdContact.name,
          dealPipelineIds: new Set<string>(),
        };
        if (parsed) {
          contactByKey.set(parsed.phoneKey, contactEntry);
          if (parsed.last10) contactByKey.set(parsed.last10, contactEntry);
        }
        contactByKey.set(displayPhone, contactEntry);
        createdContactsCount++;
      } else {
        existingContactsCount++;
      }

      const hasLeadLabel = chat.labels.some(
        (l) => l.trim().toLowerCase() === targetLeadLabelLower
      );
      const shouldCreateDeal = params.dealCreationRule === "ALL_SELECTED" || hasLeadLabel;

      let createdDealId: string | null = null;
      if (shouldCreateDeal) {
        if (contactEntry.dealPipelineIds.has(targetPipeline.id)) {
          skippedExistingDealsCount++;
        } else {
          const deal = await prisma.deal.create({
            data: {
              title: hasLeadLabel
                ? `Лид (WhatsApp): ${cleanName}`
                : `Чат WhatsApp: ${cleanName}`,
              contactId: contactEntry.id,
              pipelineId: targetPipeline.id,
              stageId: targetStage.id,
              totalBudget: 0,
              currency: Currency.KZT,
              exchangeRateAtCreation: 1.0,
              assignedToId: user.id,
            },
          });
          contactEntry.dealPipelineIds.add(targetPipeline.id);
          createdDealId = deal.id;
          createdDealsCount++;
        }
      }

      if (!contactsWithMessages.has(contactEntry.id)) {
        const msgTime =
          chat.lastMessageAt && !Number.isNaN(new Date(chat.lastMessageAt).getTime())
            ? new Date(chat.lastMessageAt)
            : new Date();
        await prisma.whatsappMessage.create({
          data: {
            instanceId: params.instanceId,
            contactId: contactEntry.id,
            dealId: createdDealId,
            remoteJid: displayPhone,
            fromMe: false,
            senderName: cleanName,
            messageType: WhatsappMessageType.TEXT,
            textContent:
              chat.lastMessageText?.trim() || "Контакт импортирован из WhatsApp",
            timestamp: msgTime,
          },
        });
        contactsWithMessages.add(contactEntry.id);
      }
    }

    revalidatePath("/settings/whatsapp");
    revalidatePath("/contacts");
    revalidatePath("/deals");
    revalidatePath("/whatsapp");
    revalidatePath("/");

    return {
      success: true,
      createdContactsCount,
      existingContactsCount,
      createdDealsCount,
      skippedIgnoredCount,
      skippedExistingDealsCount,
      targetPipelineName: targetPipeline.name,
      targetStageName: targetStage.name,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка импорта лидов из WhatsApp";
    return { success: false, error: message };
  }
}

// 19. Получить быстрые шаблоны сообщений WhatsApp
export async function getWhatsappQuickTemplates(): Promise<WhatsappQuickTemplate[]> {
  await getAuthUser();
  const instance = await getOrCreateDefaultInstance();
  return normalizeQuickTemplates(instance.quickTemplates);
}

// 20. Обновить быстрые шаблоны сообщений WhatsApp (только ADMIN)
export async function updateWhatsappQuickTemplates(
  instanceId: string,
  templates: WhatsappQuickTemplate[]
) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Только администратор может изменять шаблоны" };
    }

    const cleaned = normalizeQuickTemplates(templates);
    await prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: {
        quickTemplates: cleaned as unknown as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/settings/whatsapp");
    revalidatePath("/whatsapp");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    return { success: true, templates: cleaned };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения шаблонов";
    return { success: false, error: message };
  }
}

// 21. Тестовый запуск вебхука Callo.com из настроек (только ADMIN)
export async function simulateCalloWebhookTest(params: {
  instanceId: string;
  phone: string;
  name?: string;
  buttonNum?: string;
}) {
  try {
    const user = await getAuthUser();
    if (user.role !== "ADMIN") {
      return { success: false, error: "Доступно только администратору" };
    }

    const res = await processCalloLeadWebhook(
      {
        ct_phone: params.phone,
        ct_button_num: params.buttonNum || "1",
        ct_campaign_id: "test-campaign",
        ct_call_id: `test-${Date.now()}`,
        ct_status: "compl_finished",
        ct_duration: "18.5",
        ...(params.name?.trim() ? { ct_name: params.name.trim() } : {}),
      },
      { instanceId: params.instanceId, isTest: true }
    );

    if (!res.success) {
      return { success: false, error: res.error };
    }

    return {
      success: true,
      contactId: res.contactId,
      dealId: res.dealId,
      phone: res.phone,
      pipelineName: res.pipelineName,
      stageName: res.stageName,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка теста вебхука Callo";
    return { success: false, error: message };
  }
}
