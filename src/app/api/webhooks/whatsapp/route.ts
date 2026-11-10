import { NextRequest, NextResponse } from "next/server";
import { processIncomingWhatsappWebhook } from "@/modules/whatsapp/actions";
import { WhatsappMessageType } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Поддержка как прямого формата, так и стандартного формата WAHA / Evolution API
    let phone = body.phone || body.sender || body.from || body.remoteJid;
    let senderName = body.senderName || body.pushName || body.name || "Клиент WhatsApp";
    let textContent = body.textContent || body.text || body.message || body.body;
    let mediaUrl = body.mediaUrl || body.url || body.media;
    let fileName = body.fileName || body.filename;
    let messageType: WhatsappMessageType = WhatsappMessageType.TEXT;

    // Определение типа сообщения
    if (body.messageType) {
      messageType = body.messageType as WhatsappMessageType;
    } else if (body.type === "image" || body.mimetype?.startsWith("image/")) {
      messageType = WhatsappMessageType.IMAGE;
    } else if (body.type === "audio" || body.type === "voice" || body.mimetype?.startsWith("audio/")) {
      messageType = WhatsappMessageType.AUDIO;
    } else if (body.type === "document" || body.mimetype?.includes("pdf") || fileName?.endsWith(".pdf")) {
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
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
