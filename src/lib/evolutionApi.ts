import QRCode from "qrcode";
import { WhatsappMessageType } from "@prisma/client";

export interface EvoFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  usedBaseUrl?: string;
}

/**
 * Преобразует пользовательский URL в список кандидатов для запроса к Evolution API.
 * Если указан внутренний Docker-сервис Coolify без порта (например http://vnyycpkg6op6tz0um8qdzuqf),
 * сначала пробуем стандартный порт Evolution API :8080.
 */
export function resolveCandidateUrls(rawUrl: string): string[] {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return [];

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.includes(".") && !/^\d+\.\d+\.\d+\.\d+/.test(trimmed)
    ? `https://${trimmed}`
    : `http://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const base = `${parsed.protocol}//${parsed.host}`;

    // Однословный hostname внутренней Docker-сети без явного порта -> пробуем :8080 первым
    if (
      parsed.protocol === "http:" &&
      !parsed.port &&
      !parsed.hostname.includes(".") &&
      parsed.hostname !== "localhost"
    ) {
      return [`http://${parsed.hostname}:8080`, base];
    }

    return [base];
  } catch {
    return [trimmed.replace(/\/+$/, "")];
  }
}

/**
 * Приводит имя инстанса в Evolution API к безопасному ASCII-идентификатору.
 */
export function normalizeEvolutionInstanceName(name: string, fallbackId?: string): string {
  const trimmed = (name || "").trim();
  if (/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length >= 2) return slug;
  return `dama-crm-${(fallbackId || "main").slice(-6)}`;
}

/**
 * Форматирует JID / номер из Evolution API в читаемый номер телефона (+7...).
 */
export function formatJidToPhone(jid?: string | null): string | null {
  if (!jid) return null;
  const digits = jid.split("@")[0].split(":")[0].replace(/[^\d]/g, "");
  if (!digits) return null;
  return `+${digits}`;
}

function extractEvoError(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim()) {
    return body.slice(0, 200);
  }
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const resp = obj.response as Record<string, unknown> | undefined;
    if (resp?.message) {
      if (Array.isArray(resp.message)) return resp.message.join(", ");
      return String(resp.message);
    }
    if (obj.message) {
      if (Array.isArray(obj.message)) return obj.message.join(", ");
      return String(obj.message);
    }
    if (obj.error) return String(obj.error);
  }
  if (status === 401 || status === 403) {
    return "Неверный API-ключ Evolution API (проверьте AUTHENTICATION_API_KEY)";
  }
  return `Ошибка Evolution API (HTTP ${status})`;
}

export async function evoFetch<T = unknown>(
  rawApiUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<EvoFetchResult<T>> {
  const candidates = resolveCandidateUrls(rawApiUrl);
  if (candidates.length === 0) {
    return { ok: false, status: 0, error: "Не указан URL шлюза Evolution API" };
  }

  let lastNetworkError = "Не удалось подключиться к серверу Evolution API";

  for (const baseUrl of candidates) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${baseUrl}${cleanPath}`;

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
          ...(init?.headers || {}),
        },
        cache: "no-store",
        signal: init?.signal || AbortSignal.timeout(12000),
      });

      const text = await response.text();
      let parsed: unknown = undefined;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: parsed as T,
          error: extractEvoError(response.status, parsed),
          usedBaseUrl: baseUrl,
        };
      }

      return {
        ok: true,
        status: response.status,
        data: parsed as T,
        usedBaseUrl: baseUrl,
      };
    } catch (err: unknown) {
      lastNetworkError =
        err instanceof Error
          ? `Ошибка сети при подключении к ${baseUrl}: ${err.message}`
          : `Ошибка сети при подключении к ${baseUrl}`;
      // Пробуем следующий URL-кандидат только при сетевой ошибке
    }
  }

  return {
    ok: false,
    status: 0,
    error: `${lastNetworkError}. Рекомендуемый URL: https://wa.da-marketing.pro`,
  };
}

async function resolveQrDataUrl(payload: Record<string, unknown> | undefined): Promise<{
  qrBase64: string | null;
  pairingCode: string | null;
}> {
  if (!payload) return { qrBase64: null, pairingCode: null };

  const qrBlock = (payload.qrcode as Record<string, unknown> | undefined) || payload;
  const rawBase64 = typeof qrBlock.base64 === "string" ? qrBlock.base64.trim() : "";
  const rawCode = typeof qrBlock.code === "string" ? qrBlock.code.trim() : "";
  const pairingCode =
    typeof qrBlock.pairingCode === "string" && qrBlock.pairingCode.trim()
      ? qrBlock.pairingCode.trim()
      : null;

  if (rawBase64) {
    const normalized = rawBase64.startsWith("data:image/")
      ? rawBase64
      : `data:image/png;base64,${rawBase64}`;
    return { qrBase64: normalized, pairingCode };
  }

  if (rawCode) {
    const generated = await QRCode.toDataURL(rawCode, {
      width: 320,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    return { qrBase64: generated, pairingCode };
  }

  return { qrBase64: null, pairingCode };
}

/**
 * Настраивает Webhook на инстансе Evolution API v2.2 для получения входящих сообщений и статусов.
 */
export async function setEvolutionWebhook(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { apiUrl, apiKey, instanceName, webhookUrl } = params;
  if (!webhookUrl || webhookUrl.startsWith("/")) {
    return { ok: false, error: "Укажите полный публичный URL вебхука (https://...)" };
  }

  const res = await evoFetch(apiUrl, apiKey, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    }),
  });

  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  return { ok: true };
}

/**
 * Проверяет текущее состояние подключения инстанса Evolution API и номер телефона владельца.
 */
export async function getEvolutionStatus(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}): Promise<{
  ok: boolean;
  state: "open" | "connecting" | "close" | "not_found";
  phoneNumber: string | null;
  error?: string;
}> {
  const { apiUrl, apiKey, instanceName } = params;
  const res = await evoFetch<Record<string, unknown>>(
    apiUrl,
    apiKey,
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    { method: "GET" }
  );

  if (!res.ok) {
    if (res.status === 404) {
      return { ok: true, state: "not_found", phoneNumber: null };
    }
    return { ok: false, state: "close", phoneNumber: null, error: res.error };
  }

  const inst = (res.data?.instance as Record<string, unknown> | undefined) || res.data;
  const rawState = String(inst?.state || "close").toLowerCase();
  const state =
    rawState === "open" ? "open" : rawState === "connecting" ? "connecting" : "close";

  let phoneNumber: string | null = null;
  if (state === "open") {
    const fetchRes = await evoFetch<Array<Record<string, unknown>>>(
      apiUrl,
      apiKey,
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { method: "GET" }
    );
    if (fetchRes.ok && Array.isArray(fetchRes.data)) {
      const found =
        fetchRes.data.find(
          (item) =>
            item.name === instanceName ||
            (item.instance as Record<string, unknown> | undefined)?.instanceName === instanceName
        ) || fetchRes.data[0];

      const ownerJid =
        (found?.ownerJid as string | undefined) ||
        ((found?.instance as Record<string, unknown> | undefined)?.owner as string | undefined);
      phoneNumber = formatJidToPhone(ownerJid);
    }
  }

  return { ok: true, state, phoneNumber };
}

/**
 * Создает инстанс при необходимости, прописывает Webhook и возвращает реальный QR-код WhatsApp Web.
 */
export async function ensureInstanceAndGetQr(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl?: string;
}): Promise<{
  success: boolean;
  connected?: boolean;
  qrBase64?: string | null;
  pairingCode?: string | null;
  phoneNumber?: string | null;
  webhookConfigured?: boolean;
  webhookError?: string;
  error?: string;
}> {
  const { apiUrl, apiKey, instanceName, webhookUrl } = params;

  const currentStatus = await getEvolutionStatus({ apiUrl, apiKey, instanceName });
  if (!currentStatus.ok) {
    return { success: false, error: currentStatus.error };
  }

  let webhookConfigured = false;
  let webhookError: string | undefined;

  if (currentStatus.state === "open") {
    if (webhookUrl) {
      const wh = await setEvolutionWebhook({ apiUrl, apiKey, instanceName, webhookUrl });
      webhookConfigured = wh.ok;
      webhookError = wh.error;
    }
    return {
      success: true,
      connected: true,
      qrBase64: null,
      phoneNumber: currentStatus.phoneNumber,
      webhookConfigured,
      webhookError,
    };
  }

  let createPayload: Record<string, unknown> | undefined;

  if (currentStatus.state === "not_found") {
    const createRes = await evoFetch<Record<string, unknown>>(apiUrl, apiKey, "/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    if (!createRes.ok) {
      return { success: false, error: createRes.error || "Не удалось создать инстанс" };
    }
    createPayload = createRes.data;
  }

  if (webhookUrl) {
    const wh = await setEvolutionWebhook({ apiUrl, apiKey, instanceName, webhookUrl });
    webhookConfigured = wh.ok;
    webhookError = wh.error;
  }

  // Пробуем достать QR сразу из ответа создания
  let qr = await resolveQrDataUrl(createPayload);

  // Если QR ещё не получен (или инстанс уже существовал), вызываем /instance/connect
  if (!qr.qrBase64) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const connectRes = await evoFetch<Record<string, unknown>>(
        apiUrl,
        apiKey,
        `/instance/connect/${encodeURIComponent(instanceName)}`,
        { method: "GET" }
      );

      if (!connectRes.ok) {
        return {
          success: false,
          error: connectRes.error || "Не удалось получить QR-код от Evolution API",
        };
      }

      // Может оказаться, что инстанс уже успел подключиться
      const instState = String(
        (connectRes.data?.instance as Record<string, unknown> | undefined)?.state || ""
      ).toLowerCase();
      if (instState === "open") {
        return {
          success: true,
          connected: true,
          qrBase64: null,
          webhookConfigured,
          webhookError,
        };
      }

      qr = await resolveQrDataUrl(connectRes.data);
      if (qr.qrBase64) break;

      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  if (!qr.qrBase64) {
    return {
      success: false,
      error:
        "Evolution API не вернул QR-код (инстанс может быть в процессе запуска). Нажмите «Обновить QR-код» через 2–3 секунды.",
      webhookConfigured,
      webhookError,
    };
  }

  return {
    success: true,
    connected: false,
    qrBase64: qr.qrBase64,
    pairingCode: qr.pairingCode,
    webhookConfigured,
    webhookError,
  };
}

export async function logoutEvolutionInstance(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await evoFetch(
    params.apiUrl,
    params.apiKey,
    `/instance/logout/${encodeURIComponent(params.instanceName)}`,
    { method: "DELETE" }
  );

  if (!res.ok && res.status !== 404) {
    return { ok: false, error: res.error };
  }
  return { ok: true };
}

function formatNumberForEvolution(remoteJidOrPhone: string): string {
  const trimmed = remoteJidOrPhone.trim();
  if (trimmed.endsWith("@g.us") || trimmed.endsWith("@lid")) {
    return trimmed;
  }
  const stripped = trimmed.replace(/@s\.whatsapp\.net$/i, "").replace(/[^\d]/g, "");
  return stripped || trimmed;
}

function parseMediaPayload(mediaUrl: string, fallbackMime: string): {
  mediaValue: string;
  mimetype: string;
} {
  const match = mediaUrl.trim().match(/^data:([^,;]+)(?:;[^,]+)*;base64,([\s\S]+)$/);
  if (match) {
    return {
      mimetype: match[1].trim() || fallbackMime,
      mediaValue: match[2].replace(/\s+/g, ""),
    };
  }
  return {
    mimetype: fallbackMime,
    mediaValue: mediaUrl.trim(),
  };
}

export async function sendEvolutionMessage(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  to: string;
  messageType: WhatsappMessageType;
  textContent?: string;
  mediaUrl?: string;
  fileName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { apiUrl, apiKey, instanceName, to, messageType, textContent, mediaUrl, fileName } = params;
  const number = formatNumberForEvolution(to);
  const encodedInstance = encodeURIComponent(instanceName);

  if (messageType === WhatsappMessageType.TEXT) {
    const res = await evoFetch(apiUrl, apiKey, `/message/sendText/${encodedInstance}`, {
      method: "POST",
      body: JSON.stringify({
        number,
        text: textContent || "",
      }),
    });
    return { ok: res.ok, error: res.error };
  }

  if (!mediaUrl) {
    return { ok: false, error: "Отсутствует файл или ссылка на вложение" };
  }

  if (messageType === WhatsappMessageType.AUDIO) {
    const { mediaValue, mimetype } = parseMediaPayload(mediaUrl, "audio/ogg");
    const res = await evoFetch(apiUrl, apiKey, `/message/sendWhatsAppAudio/${encodedInstance}`, {
      method: "POST",
      body: JSON.stringify({
        number,
        audio: mediaValue,
      }),
    });

    if (res.ok) return { ok: true };

    // Запасной вариант через sendMedia, если браузерная запись (например audio/webm) не принята как PTT
    const fallbackRes = await evoFetch(apiUrl, apiKey, `/message/sendMedia/${encodedInstance}`, {
      method: "POST",
      body: JSON.stringify({
        number,
        mediatype: "audio",
        mimetype,
        media: mediaValue,
        fileName: fileName || "voice-message.webm",
      }),
    });
    return { ok: fallbackRes.ok, error: fallbackRes.ok ? undefined : res.error || fallbackRes.error };
  }

  const isImage = messageType === WhatsappMessageType.IMAGE;
  const { mediaValue, mimetype } = parseMediaPayload(
    mediaUrl,
    isImage ? "image/jpeg" : "application/pdf"
  );

  const res = await evoFetch(apiUrl, apiKey, `/message/sendMedia/${encodedInstance}`, {
    method: "POST",
    body: JSON.stringify({
      number,
      mediatype: isImage ? "image" : "document",
      mimetype,
      caption: textContent || "",
      media: mediaValue,
      fileName: fileName || (isImage ? "image.jpg" : "document.pdf"),
    }),
  });

  return { ok: res.ok, error: res.error };
}

/**
 * Догружает media в Base64 по ID сообщения, если webhook пришел без встроенного поля base64.
 */
export async function fetchMediaBase64FromEvolution(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  messageKey: { id: string; remoteJid?: string; fromMe?: boolean };
  fallbackMime: string;
}): Promise<string | null> {
  const res = await evoFetch<{ base64?: string; mimetype?: string }>(
    params.apiUrl,
    params.apiKey,
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(params.instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        message: { key: params.messageKey },
        convertToMp4: false,
      }),
    }
  );

  if (!res.ok || !res.data?.base64) return null;
  const raw = res.data.base64.trim();
  if (raw.startsWith("data:")) return raw;
  const mime = res.data.mimetype || params.fallbackMime;
  return `data:${mime};base64,${raw}`;
}
