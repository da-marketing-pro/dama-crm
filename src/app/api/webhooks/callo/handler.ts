import { NextRequest, NextResponse } from "next/server";
import {
  extractCalloParamsFromRequest,
  getDefaultWhatsappInstanceForCallo,
  processCalloLeadWebhook,
  saveLastCalloWebhookDebug,
  summarizeCalloParams,
  verifyCalloWebhookToken,
} from "@/lib/calloWebhook";
import {
  getEvolutionStatus,
  normalizeEvolutionInstanceName,
  ensureInstanceAndGetQr,
} from "@/lib/evolutionApi";

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

    const { params, rawBody, headersSummary } = await extractCalloParamsFromRequest(req);
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
        headersSummary,
      });
      return NextResponse.json(
        { success: false, error: "Неверный или отсутствующий токен вебхука" },
        { status: 401 }
      );
    }

    // Диагностический режим: безопасная проверка работы роута без создания лидов и без перезаписи телеметрии
    const isInspection =
      req.method === "GET" &&
      (req.nextUrl.searchParams.has("inspect") ||
        req.nextUrl.searchParams.has("debug") ||
        req.nextUrl.searchParams.has("status"));

    if (isInspection) {
      const instanceName = normalizeEvolutionInstanceName(instance.name, instance.id);
      const evoCheck = await getEvolutionStatus({
        apiUrl: instance.apiUrl || "https://wa.da-marketing.pro",
        apiKey: instance.apiKey || "",
        instanceName,
      });

      let testQrResult: unknown = null;
      if (req.nextUrl.searchParams.has("test_qr")) {
        testQrResult = await ensureInstanceAndGetQr({
          apiUrl: instance.apiUrl || "https://wa.da-marketing.pro",
          apiKey: instance.apiKey || "",
          instanceName,
          forceReset: req.nextUrl.searchParams.has("force_reset"),
        });
      }

      return NextResponse.json({
        ok: true,
        instanceId: instance.id,
        instanceName: instance.name,
        normalizedInstanceName: instanceName,
        instancePhone: instance.phoneNumber,
        instanceStatus: instance.status,
        apiUrl: instance.apiUrl,
        apiKeyMasked: instance.apiKey
          ? `${instance.apiKey.slice(0, 4)}...${instance.apiKey.slice(-4)} (len ${instance.apiKey.length})`
          : "EMPTY",
        lastQrUpdatedAt: instance.lastQrUpdatedAt,
        hasLastQrCode: Boolean(instance.lastQrCode),
        evoCheck,
        testQrResult,
        lastCalloWebhook: instance.lastCalloWebhook,
      });
    }

    const result = await processCalloLeadWebhook(params, {
      instanceId: instance.id,
      method: req.method,
      rawBody,
      headersSummary,
    });

    return NextResponse.json(result, { status: result.statusCode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обработки вебхука Callo";
    console.error("[Callo Webhook Error]:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
