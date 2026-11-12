import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { WhatsappMessageType, WhatsappStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processIncomingWhatsappWebhook } from "@/modules/whatsapp/actions";
import { applyEvolutionLabelEvent } from "@/lib/whatsappFiltering";
import {
  fetchMediaBase64FromEvolution,
  formatJidToPhone,
  normalizeEvolutionInstanceName,
  resolveQrDataUrl,
} from "@/lib/evolutionApi";

async function resolveWhatsappInstance(instanceName?: string, explicitId?: string) {
  if (explicitId) {
    const byId = await prisma.whatsappInstance.findUnique({ where: { id: explicitId } });
    if (byId) return byId;
  }

  if (instanceName) {
    const all = await prisma.whatsappInstance.findMany();
    const target = all.find(
      (inst) =>
        inst.name === instanceName ||
        normalizeEvolutionInstanceName(inst.name, inst.id) === instanceName
    );
    if (target) return target;
  }

  return (
    (await prisma.whatsappInstance.findFirst({ where: { isDefault: true } })) ||
    (await prisma.whatsappInstance.findFirst())
  );
}

function unwrapMessageContent(rawMsg: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!rawMsg) return {};
  if (rawMsg.ephemeralMessage && typeof rawMsg.ephemeralMessage === "object") {
    const inner = (rawMsg.ephemeralMessage as Record<string, unknown>).message as
      | Record<string, unknown>
      | undefined;
    if (inner) return unwrapMessageContent(inner);
  }
  if (rawMsg.viewOnceMessage && typeof rawMsg.viewOnceMessage === "object") {
    const inner = (rawMsg.viewOnceMessage as Record<string, unknown>).message as
      | Record<string, unknown>
      | undefined;
    if (inner) return unwrapMessageContent(inner);
  }
  if (rawMsg.viewOnceMessageV2 && typeof rawMsg.viewOnceMessageV2 === "object") {
    const inner = (rawMsg.viewOnceMessageV2 as Record<string, unknown>).message as
      | Record<string, unknown>
      | undefined;
    if (inner) return unwrapMessageContent(inner);
  }
  if (rawMsg.documentWithCaptionMessage && typeof rawMsg.documentWithCaptionMessage === "object") {
    const inner = (rawMsg.documentWithCaptionMessage as Record<string, unknown>).message as
      | Record<string, unknown>
      | undefined;
    if (inner) return unwrapMessageContent(inner);
  }
  return rawMsg;
}

function toDataUri(raw: unknown, mimetype: string): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("http")) {
    return trimmed;
  }
  return `data:${mimetype};base64,${trimmed}`;
}

function extractContextInfo(
  msgItem: Record<string, unknown>,
  rawMessage: Record<string, unknown>
): Record<string, unknown> | undefined {
  const candidates = [
    rawMessage.extendedTextMessage,
    rawMessage.imageMessage,
    rawMessage.videoMessage,
    rawMessage.documentMessage,
    rawMessage.audioMessage,
    rawMessage.pttMessage,
    rawMessage.buttonsResponseMessage,
    rawMessage.templateButtonReplyMessage,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const ctx = (candidate as Record<string, unknown>).contextInfo;
      if (ctx && typeof ctx === "object") return ctx as Record<string, unknown>;
    }
  }
  if (rawMessage.contextInfo && typeof rawMessage.contextInfo === "object") {
    return rawMessage.contextInfo as Record<string, unknown>;
  }
  if (msgItem.contextInfo && typeof msgItem.contextInfo === "object") {
    return msgItem.contextInfo as Record<string, unknown>;
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Обработка событий Evolution API v2 (имеют поле event + data)
    if (typeof body?.event === "string") {
      const normalizedEvent = body.event.toLowerCase().replace(/_/g, ".");
      const instanceName = typeof body.instance === "string" ? body.instance : undefined;
      const instance = await resolveWhatsappInstance(instanceName);

      // 1A. Обновление статуса соединения (QR отсканирован / отвязан)
      if (normalizedEvent === "connection.update") {
        const state = String(body.data?.state || "").toLowerCase();
        const statusReason = Number(body.data?.statusReason || 0);

        if (instance) {
          if (state === "open") {
            const ownerPhone = formatJidToPhone(body.sender || body.data?.wuid);
            await prisma.whatsappInstance.update({
              where: { id: instance.id },
              data: {
                status: WhatsappStatus.CONNECTED,
                lastQrCode: null,
                lastPairingCode: null,
                lastQrUpdatedAt: null,
                ...(ownerPhone ? { phoneNumber: ownerPhone } : {}),
              },
            });
            revalidatePath("/settings/whatsapp");
            revalidatePath("/whatsapp");
          } else if (state === "close" && statusReason === 401) {
            await prisma.whatsappInstance.update({
              where: { id: instance.id },
              data: {
                status: WhatsappStatus.DISCONNECTED,
                lastQrCode: null,
                lastPairingCode: null,
                lastQrUpdatedAt: null,
              },
            });
            revalidatePath("/settings/whatsapp");
            revalidatePath("/whatsapp");
          }
        }

        return NextResponse.json({ success: true, handled: "connection.update", state });
      }

      // 1A-bis. Асинхронная доставка QR-кода от Evolution API v2 (QRCODE_UPDATED)
      if (normalizedEvent === "qrcode.updated") {
        const qr = await resolveQrDataUrl(
          (body.data || {}) as Record<string, unknown> | undefined
        );
        if (instance && (qr.qrBase64 || qr.pairingCode)) {
          await prisma.whatsappInstance.update({
            where: { id: instance.id },
            data: {
              status: WhatsappStatus.QR_READY,
              lastQrCode: qr.qrBase64,
              lastPairingCode: qr.pairingCode,
              lastQrUpdatedAt: new Date(),
            },
          });
        }
        return NextResponse.json({
          success: true,
          handled: "qrcode.updated",
          stored: Boolean(instance && (qr.qrBase64 || qr.pairingCode)),
        });
      }

      // 1B. События ярлыков WhatsApp Business (Вариант 4: Списки / Labels)
      if (normalizedEvent === "labels.association" || normalizedEvent === "labels.edit") {
        const labelResult = await applyEvolutionLabelEvent({
          instance,
          normalizedEvent,
          data: (body.data || {}) as Record<string, unknown>,
          senderFallback: typeof body.sender === "string" ? body.sender : undefined,
        });
        return NextResponse.json(labelResult);
      }

      // 1C. Игнорируем прочие служебные события без ошибки, чтобы Evolution не ретраил вебхук
      if (normalizedEvent !== "messages.upsert") {
        return NextResponse.json({ success: true, ignored: body.event });
      }

      const msgItem = (Array.isArray(body.data) ? body.data[0] : body.data) as
        | Record<string, unknown>
        | undefined;
      if (!msgItem) {
        return NextResponse.json({ success: true, ignored: "empty_data" });
      }

      const key = (msgItem.key || {}) as Record<string, unknown>;
      const rawRemoteJid = String(key.remoteJid || "");

      if (!rawRemoteJid || rawRemoteJid === "status@broadcast") {
        return NextResponse.json({ success: true, ignored: "status_broadcast" });
      }
      if (rawRemoteJid.endsWith("@g.us")) {
        return NextResponse.json({ success: true, ignored: "group_message" });
      }
      if (key.fromMe === true) {
        return NextResponse.json({ success: true, ignored: "from_me" });
      }

      // Если WhatsApp прислал LID, предпочитаем альтернативный телефонный JID если он есть
      const phoneSource =
        (typeof key.remoteJidAlt === "string" && key.remoteJidAlt) ||
        (typeof key.participantPn === "string" && key.participantPn) ||
        (typeof msgItem.senderPn === "string" && msgItem.senderPn) ||
        rawRemoteJid;

      const senderName =
        (typeof msgItem.pushName === "string" && msgItem.pushName.trim()) ||
        (typeof body.pushName === "string" && body.pushName.trim()) ||
        undefined;

      const rawMessage = unwrapMessageContent(
        msgItem.message as Record<string, unknown> | undefined
      );

      let messageType: WhatsappMessageType = WhatsappMessageType.TEXT;
      let textContent: string | undefined;
      let mediaUrl: string | undefined;
      let fileName: string | undefined;
      let detectedMime = "application/octet-stream";

      const imageMsg = rawMessage.imageMessage as Record<string, unknown> | undefined;
      const audioMsg = (rawMessage.audioMessage || rawMessage.pttMessage) as
        | Record<string, unknown>
        | undefined;
      const documentMsg = rawMessage.documentMessage as Record<string, unknown> | undefined;
      const videoMsg = rawMessage.videoMessage as Record<string, unknown> | undefined;
      const extMsg = rawMessage.extendedTextMessage as Record<string, unknown> | undefined;

      if (imageMsg) {
        messageType = WhatsappMessageType.IMAGE;
        detectedMime = String(imageMsg.mimetype || "image/jpeg");
        textContent = typeof imageMsg.caption === "string" ? imageMsg.caption : undefined;
        mediaUrl = toDataUri(rawMessage.base64 || imageMsg.base64, detectedMime);
      } else if (audioMsg) {
        messageType = WhatsappMessageType.AUDIO;
        detectedMime = String(audioMsg.mimetype || "audio/ogg");
        mediaUrl = toDataUri(rawMessage.base64 || audioMsg.base64, detectedMime);
      } else if (documentMsg) {
        messageType = WhatsappMessageType.DOCUMENT;
        detectedMime = String(documentMsg.mimetype || "application/pdf");
        fileName =
          (typeof documentMsg.fileName === "string" && documentMsg.fileName) ||
          (typeof documentMsg.title === "string" && documentMsg.title) ||
          "Документ.pdf";
        textContent = typeof documentMsg.caption === "string" ? documentMsg.caption : undefined;
        mediaUrl = toDataUri(rawMessage.base64 || documentMsg.base64, detectedMime);
      } else if (videoMsg) {
        const cap = typeof videoMsg.caption === "string" ? videoMsg.caption : "";
        textContent = cap ? `[Видео] ${cap}` : "[Видеосообщение]";
      } else {
        textContent =
          (typeof rawMessage.conversation === "string" && rawMessage.conversation) ||
          (typeof extMsg?.text === "string" && extMsg.text) ||
          (typeof msgItem.text === "string" && msgItem.text) ||
          undefined;
      }

      // Если медиа-файл не был встроен в webhook как base64 — догружаем через Evolution API
      if (
        messageType !== WhatsappMessageType.TEXT &&
        !mediaUrl &&
        instance?.apiUrl &&
        instance?.apiKey &&
        typeof key.id === "string"
      ) {
        const evoMedia = await fetchMediaBase64FromEvolution({
          apiUrl: instance.apiUrl,
          apiKey: instance.apiKey,
          instanceName: normalizeEvolutionInstanceName(instance.name, instance.id),
          messageKey: {
            id: key.id,
            remoteJid: rawRemoteJid,
            fromMe: false,
          },
          fallbackMime: detectedMime,
        });
        if (evoMedia) mediaUrl = evoMedia;
      }

      const contextInfo = extractContextInfo(msgItem, rawMessage);
      const isFromAd = Boolean(
        contextInfo &&
          (contextInfo.externalAdReply ||
            contextInfo.conversionSource ||
            contextInfo.ctwaPayload ||
            contextInfo.conversionData)
      );

      // Пропускаем пустые системные уведомления без текста и медиа
      if (!textContent && !mediaUrl) {
        return NextResponse.json({ success: true, ignored: "unsupported_or_empty_message" });
      }

      const result = await processIncomingWhatsappWebhook({
        phone: phoneSource,
        rawRemoteJid,
        senderName,
        messageType,
        textContent,
        mediaUrl,
        fileName,
        instanceId: instance?.id,
        isFromAd,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    // 2. Прямой формат (симулятор / кастомные POST-интеграции)
    const phone = body.phone || body.sender || body.from || body.remoteJid;
    const senderName = body.senderName || body.pushName || body.name || "Клиент WhatsApp";
    const textContent = body.textContent || body.text || body.message || body.body;
    const mediaUrl = body.mediaUrl || body.url || body.media;
    const fileName = body.fileName || body.filename;
    let messageType: WhatsappMessageType = WhatsappMessageType.TEXT;

    if (body.messageType) {
      messageType = body.messageType as WhatsappMessageType;
    } else if (body.type === "image" || body.mimetype?.startsWith("image/")) {
      messageType = WhatsappMessageType.IMAGE;
    } else if (body.type === "audio" || body.type === "voice" || body.mimetype?.startsWith("audio/")) {
      messageType = WhatsappMessageType.AUDIO;
    } else if (
      body.type === "document" ||
      body.mimetype?.includes("pdf") ||
      fileName?.endsWith(".pdf")
    ) {
      messageType = WhatsappMessageType.DOCUMENT;
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Missing required parameter: phone or remoteJid" },
        { status: 400 }
      );
    }

    const result = await processIncomingWhatsappWebhook({
      phone,
      senderName,
      messageType,
      textContent,
      mediaUrl,
      fileName,
      instanceId: body.instanceId,
      isFromAd: Boolean(body.isFromAd),
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Webhook processing error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
