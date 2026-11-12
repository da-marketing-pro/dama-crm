import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  fetchEvolutionContacts,
  fetchEvolutionLabels,
  formatJidToPhone,
  normalizeEvolutionInstanceName,
} from "@/lib/evolutionApi";
import {
  extractPhoneKeyAndRaw,
  NormalizedPhoneKey,
  resolveEffectiveIgnoredLabels,
} from "@/lib/whatsappFilterUtils";

export interface IgnoredMatchResult {
  ignored: boolean;
  recordId?: string;
  reason?: string | null;
  source?: string;
  normalized: NormalizedPhoneKey | null;
}

/**
 * Проверяет, находится ли телефон или JID (@s.whatsapp.net / @lid) в стоп-листе.
 */
export async function checkWhatsappNumberIgnored(
  rawPhoneOrJid: string,
  fallbackRawJid?: string
): Promise<IgnoredMatchResult> {
  const primary = extractPhoneKeyAndRaw(rawPhoneOrJid, fallbackRawJid);
  const secondary =
    fallbackRawJid && fallbackRawJid !== rawPhoneOrJid
      ? extractPhoneKeyAndRaw(fallbackRawJid)
      : null;

  const orConditions: Prisma.WhatsappIgnoredNumberWhereInput[] = [];

  for (const item of [primary, secondary]) {
    if (!item) continue;
    orConditions.push({ phoneKey: item.phoneKey });
    if (!item.isLid && item.last10.length >= 10) {
      orConditions.push({ phoneKey: { endsWith: item.last10 } });
    }
  }

  if (orConditions.length === 0) {
    return { ignored: false, normalized: primary };
  }

  const match = await prisma.whatsappIgnoredNumber.findFirst({
    where: { OR: orConditions },
    select: { id: true, reason: true, source: true },
  });

  return {
    ignored: Boolean(match),
    recordId: match?.id,
    reason: match?.reason,
    source: match?.source,
    normalized: primary,
  };
}

/**
 * Загружает множество всех игнорируемых ключей (exact phoneKey + last10)
 * для быстрой O(1) фильтрации списка бесед.
 */
export async function loadIgnoredPhoneKeySets(): Promise<{
  exactKeys: Set<string>;
  last10Keys: Set<string>;
}> {
  const rows = await prisma.whatsappIgnoredNumber.findMany({
    select: { phoneKey: true },
  });
  const exactKeys = new Set<string>();
  const last10Keys = new Set<string>();

  for (const row of rows) {
    exactKeys.add(row.phoneKey);
    if (!row.phoneKey.startsWith("lid:") && row.phoneKey.length >= 10) {
      last10Keys.add(row.phoneKey.slice(-10));
    }
  }

  return { exactKeys, last10Keys };
}

export function matchesIgnoredKeySets(
  phoneOrJid: string | null | undefined,
  sets: { exactKeys: Set<string>; last10Keys: Set<string> }
): boolean {
  if (!phoneOrJid || sets.exactKeys.size === 0) return false;
  const parsed = extractPhoneKeyAndRaw(phoneOrJid);
  if (!parsed) return false;
  if (sets.exactKeys.has(parsed.phoneKey)) return true;
  if (!parsed.isLid && parsed.last10.length >= 10 && sets.last10Keys.has(parsed.last10)) {
    return true;
  }
  return false;
}

/**
 * Добавляет или обновляет запись в таблице whatsapp_ignored_numbers.
 */
export async function upsertIgnoredWhatsappNumber(params: {
  instanceId?: string | null;
  rawPhone: string;
  displayName?: string | null;
  reason?: string | null;
  source?: string;
  labelId?: string | null;
  labelName?: string | null;
}) {
  const normalized = extractPhoneKeyAndRaw(params.rawPhone);
  if (!normalized) return null;

  return prisma.whatsappIgnoredNumber.upsert({
    where: { phoneKey: normalized.phoneKey },
    create: {
      instanceId: params.instanceId || null,
      phoneKey: normalized.phoneKey,
      rawPhone: normalized.rawDisplay,
      displayName: params.displayName?.trim() || null,
      reason: params.reason?.trim() || null,
      source: params.source || "MANUAL",
      labelId: params.labelId || null,
      labelName: params.labelName?.trim() || null,
    },
    update: {
      ...(params.instanceId !== undefined ? { instanceId: params.instanceId } : {}),
      rawPhone: normalized.rawDisplay,
      ...(params.displayName !== undefined
        ? { displayName: params.displayName?.trim() || null }
        : {}),
      ...(params.reason !== undefined ? { reason: params.reason?.trim() || null } : {}),
      ...(params.source !== undefined ? { source: params.source } : {}),
      ...(params.labelId !== undefined ? { labelId: params.labelId } : {}),
      ...(params.labelName !== undefined ? { labelName: params.labelName?.trim() || null } : {}),
    },
  });
}

/**
 * Безопасно очищает ТОЛЬКО автоматически созданный пустой авто-лид ("Лид из WhatsApp: ...",
 * бюджет 0, без оплат и задач), чтобы отметка рабочего чата не оставляла мусор в воронке.
 * Реальные контакты и сделки с бюджетом/оплатами/задачами никогда не удаляются.
 */
export async function safeCleanupAutoCreatedLead(params: {
  phoneOrJid: string;
  contactId?: string | null;
  maxAgeHours?: number;
}): Promise<{ deletedDealsCount: number; deletedContact: boolean }> {
  const parsed = extractPhoneKeyAndRaw(params.phoneOrJid);
  let contact = null;

  if (params.contactId) {
    contact = await prisma.contact.findUnique({
      where: { id: params.contactId },
      include: {
        deals: {
          include: {
            _count: { select: { payments: true, tasks: true } },
          },
        },
        _count: { select: { payments: true, tasks: true } },
      },
    });
  } else if (parsed) {
    const candidates = await prisma.contact.findMany({
      where: {
        OR: [
          { phone: parsed.rawDisplay },
          ...(parsed.last10.length >= 10 ? [{ phone: { contains: parsed.last10 } }] : []),
        ],
      },
      include: {
        deals: {
          include: {
            _count: { select: { payments: true, tasks: true } },
          },
        },
        _count: { select: { payments: true, tasks: true } },
      },
      take: 3,
    });
    contact =
      candidates.find((c) => {
        const cp = extractPhoneKeyAndRaw(c.phone);
        return cp?.phoneKey === parsed.phoneKey || (cp?.last10 && cp.last10 === parsed.last10);
      }) || null;
  }

  if (!contact) {
    return { deletedDealsCount: 0, deletedContact: false };
  }

  const nowMs = Date.now();
  const maxAgeMs = params.maxAgeHours ? params.maxAgeHours * 3600 * 1000 : null;

  const autoDealsToDelete = contact.deals.filter((deal) => {
    const isAutoTitle = deal.title.startsWith("Лид из WhatsApp:");
    const isUntouched =
      deal.totalBudget === 0 && deal._count.payments === 0 && deal._count.tasks === 0;
    const withinAge =
      maxAgeMs === null || nowMs - new Date(deal.createdAt).getTime() <= maxAgeMs;
    return isAutoTitle && isUntouched && withinAge;
  });

  if (autoDealsToDelete.length > 0) {
    await prisma.deal.deleteMany({
      where: { id: { in: autoDealsToDelete.map((d) => d.id) } },
    });
  }

  let deletedContact = false;
  const remainingDealsCount = contact.deals.length - autoDealsToDelete.length;
  const isAutoContact =
    contact.company === "WhatsApp Лид" &&
    remainingDealsCount <= 0 &&
    contact._count.payments === 0 &&
    contact._count.tasks === 0 &&
    !contact.email;

  if (isAutoContact) {
    const withinContactAge =
      maxAgeMs === null || nowMs - new Date(contact.createdAt).getTime() <= maxAgeMs;
    if (withinContactAge) {
      await prisma.contact.delete({ where: { id: contact.id } });
      deletedContact = true;
    }
  }

  return { deletedDealsCount: autoDealsToDelete.length, deletedContact };
}

/**
 * Обрабатывает события LABELS_ASSOCIATION / LABELS_EDIT от Evolution API v2.
 */
export async function applyEvolutionLabelEvent(params: {
  instance: {
    id: string;
    name: string;
    apiUrl: string | null;
    apiKey: string | null;
    ignoredLabelNames: Prisma.JsonValue | null;
    cachedLabels: Prisma.JsonValue | null;
  } | null;
  normalizedEvent: string;
  data: Record<string, unknown>;
  senderFallback?: string;
}) {
  const { instance, normalizedEvent, data, senderFallback } = params;
  if (!instance) {
    return { success: true, ignored: "no_instance" };
  }

  const evoInstanceName = normalizeEvolutionInstanceName(instance.name, instance.id);

  // 1. Обновление списка ярлыков (LABELS_EDIT) -> синхронизируем кэш
  if (normalizedEvent === "labels.edit") {
    if (instance.apiUrl && instance.apiKey) {
      const labelsRes = await fetchEvolutionLabels({
        apiUrl: instance.apiUrl,
        apiKey: instance.apiKey,
        instanceName: evoInstanceName,
      });
      if (labelsRes.ok) {
        await prisma.whatsappInstance.update({
          where: { id: instance.id },
          data: { cachedLabels: labelsRes.labels as unknown as Prisma.InputJsonValue },
        });
        revalidatePath("/settings/whatsapp");
      }
    }
    return { success: true, handled: "labels.edit" };
  }

  // 2. Назначение / снятие ярлыка с чата (LABELS_ASSOCIATION)
  const items = Array.isArray(data) ? data : [data];
  let processed = 0;

  let cachedLabelsList = Array.isArray(instance.cachedLabels)
    ? (instance.cachedLabels as Array<{ id?: string; name?: string; color?: string }>)
    : [];

  const ignoredLabelsLower = resolveEffectiveIgnoredLabels(instance.ignoredLabelNames).map((s) =>
    s.toLowerCase()
  );

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;

    const chatId =
      (typeof item.chatId === "string" && item.chatId) ||
      (typeof item.remoteJid === "string" && item.remoteJid) ||
      (typeof senderFallback === "string" && senderFallback) ||
      "";

    if (!chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") {
      continue;
    }

    const labelId = item.labelId != null ? String(item.labelId) : item.id != null ? String(item.id) : "";
    let labelName =
      (typeof item.labelName === "string" && item.labelName.trim()) ||
      (typeof item.name === "string" && item.name.trim()) ||
      "";

    // Ищем имя ярлыка в кэше, а если нет — запрашиваем Evolution API /label/findLabels
    if (!labelName && labelId) {
      const cached = cachedLabelsList.find((l) => String(l.id) === labelId);
      if (cached?.name) {
        labelName = cached.name;
      } else if (instance.apiUrl && instance.apiKey) {
        const freshLabels = await fetchEvolutionLabels({
          apiUrl: instance.apiUrl,
          apiKey: instance.apiKey,
          instanceName: evoInstanceName,
        });
        if (freshLabels.ok) {
          cachedLabelsList = freshLabels.labels;
          await prisma.whatsappInstance.update({
            where: { id: instance.id },
            data: { cachedLabels: freshLabels.labels as unknown as Prisma.InputJsonValue },
          });
          labelName = freshLabels.labels.find((l) => l.id === labelId)?.name || "";
        }
      }
    }

    if (!labelName) continue;

    const rawType = typeof item.type === "string" ? item.type.toLowerCase() : "";
    const isAdd =
      rawType === "add" || item.association === true || item.add === true;
    const isRemove =
      rawType === "remove" || item.association === false || item.add === false;

    if (!isAdd && !isRemove) continue;

    // Разрешаем номер телефона (если пришел @lid, пытаемся найти remoteJidAlt в контактах Evolution)
    let resolvedTarget =
      (typeof item.remoteJidAlt === "string" && item.remoteJidAlt) ||
      (typeof item.senderPn === "string" && item.senderPn) ||
      chatId;
    let displayName: string | null = null;

    if (resolvedTarget.endsWith("@lid") && instance.apiUrl && instance.apiKey) {
      const contactsRes = await fetchEvolutionContacts({
        apiUrl: instance.apiUrl,
        apiKey: instance.apiKey,
        instanceName: evoInstanceName,
      });
      if (contactsRes.ok) {
        const matched = contactsRes.contacts.find(
          (c) => c.remoteJid === resolvedTarget || c.remoteJidAlt === resolvedTarget
        );
        if (matched?.displayName) displayName = matched.displayName;
        if (matched?.remoteJidAlt && !matched.remoteJidAlt.endsWith("@lid")) {
          resolvedTarget = matched.remoteJidAlt;
        } else if (matched?.remoteJid && !matched.remoteJid.endsWith("@lid")) {
          resolvedTarget = matched.remoteJid;
        }
      }
    }

    const normalized = extractPhoneKeyAndRaw(resolvedTarget, chatId);
    if (!normalized) continue;

    const matchesIgnoredLabel = ignoredLabelsLower.includes(labelName.toLowerCase());

    if (isAdd && matchesIgnoredLabel) {
      await upsertIgnoredWhatsappNumber({
        instanceId: instance.id,
        rawPhone: formatJidToPhone(resolvedTarget) || resolvedTarget,
        displayName,
        reason: `Ярлык WhatsApp: «${labelName}»`,
        source: "LABEL",
        labelId: labelId || null,
        labelName,
      });

      // Если клиент только что написал и менеджер сразу навесил стоп-ярлык (< 24ч, без бюджета/оплат) — чистим пустой авто-лид
      await safeCleanupAutoCreatedLead({
        phoneOrJid: resolvedTarget,
        maxAgeHours: 24,
      });

      processed++;
    } else if (isRemove) {
      await prisma.whatsappIgnoredNumber.deleteMany({
        where: {
          phoneKey: normalized.phoneKey,
          source: "LABEL",
          ...(labelId ? { labelId } : { labelName }),
        },
      });
      processed++;
    }
  }

  if (processed > 0) {
    revalidatePath("/whatsapp");
    revalidatePath("/settings/whatsapp");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
  }

  return { success: true, handled: "labels.association", processed };
}
