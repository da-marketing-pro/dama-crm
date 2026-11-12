import { NextRequest, NextResponse } from "next/server";
import {
  extractCalloParamsFromRequest,
  getDefaultWhatsappInstanceForCallo,
  processCalloLeadWebhook,
  saveLastCalloWebhookDebug,
  summarizeCalloParams,
  verifyCalloWebhookToken,
} from "@/lib/calloWebhook";

export async function handleCalloWebhookRequest(
  req: NextRequest,
  pathToken?: string
) {
  try {
    const instance = await getDefaultWhatsappInstanceForCallo();
    if (!instance) {
      return NextResponse.json(
        { success: false, error: "Инстанс CRM не инициализирован" },
        { status: 500 }
      );
    }

    const params = await extractCalloParamsFromRequest(req);
    const providedToken =
      pathToken ||
      req.headers.get("x-callo-token") ||
      params.token ||
      "";

    if (!verifyCalloWebhookToken(providedToken, instance.id)) {
      await saveLastCalloWebhookDebug(instance.id, {
        receivedAt: new Date().toISOString(),
        phone: "—",
        method: req.method,
        outcome: "error",
        note: "401: неверный или отсутствующий токен вебхука",
        rawSummary: summarizeCalloParams(params),
      });
      return NextResponse.json(
        { success: false, error: "Неверный или отсутствующий токен вебхука" },
        { status: 401 }
      );
    }

    const result = await processCalloLeadWebhook(params, {
      instanceId: instance.id,
      method: req.method,
    });

    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обработки вебхука Callo";
    console.error("[Callo Webhook Error]:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
