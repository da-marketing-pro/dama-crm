import QRCode from "qrcode";
import { WhatsappMessageType } from "@prisma/client";

export interface EvoFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  usedBaseUrl?: string;
}

const preferredBaseUrlCache = new Map<string, string>();

function isKnownCoolifyEvolutionHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === "wa.da-marketing.pro" ||
    lower === "evolution-api" ||
    lower === "vnyycpkg6op6tz0um8qdzuqf"
  );
}

function isInternalDockerBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "http:" &&
      (u.hostname === "evolution-api" ||
        u.hostname === "vnyycpkg6op6tz0um8qdzuqf" ||
        (!u.hostname.includes(".") && u.hostname !== "localhost"))
    );
  } catch {
    return false;
  }
}

/**
 * Преобразует пользовательский URL в список кандидатов для запроса к Evolution API.
 * В Docker-окружении Coolify (production) для локального шлюза автоматически добавляет
 * внутренние Docker-адреса (`http://evolution-api:8080`, `http://vnyycpkg6op6tz0um8qdzuqf:8080`),
 * чтобы обойти Hairpin NAT при обращении контейнера к публичному домену того же сервера.
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
    const list: string[] = [];

    const cached = preferredBaseUrlCache.get(trimmed);
    if (cached) list.push(cached);

    const internalEnv = (process.env.EVOLUTION_INTERNAL_URL || "").trim().replace(/\/+$/, "");
    const knownCoolify = isKnownCoolifyEvolutionHost(parsed.hostname);
    const isDockerProd = process.env.NODE_ENV === "production";
    const isSingleLabelHost =
      parsed.protocol === "http:" &&
      !parsed.hostname.includes(".") &&
      parsed.hostname !== "localhost";

    if (isDockerProd) {
      if (internalEnv) list.push(internalEnv);
      if (isSingleLabelHost && !parsed.port) {
        list.push(`http://${parsed.hostname}:8080`);
      }
      if (knownCoolify) {
        list.push("http://evolution-api:8080");
        list.push("http://vnyycpkg6op6tz0um8qdzuqf:8080");
      }
      list.push(base);
      if (knownCoolify) {
        list.push("https://wa.da-marketing.pro");
      }
    } else {
      if (isSingleLabelHost && !parsed.port) {
        list.push(`http://${parsed.hostname}:8080`);
      }
      list.push(base);
      if (knownCoolify) {
        list.push("https://wa.da-marketing.pro");
      }
      if (internalEnv) list.push(internalEnv);
    }

    return Array.from(new Set(list));
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
 * Для технических @lid идентификаторов возвращает null, чтобы не путать LID с реальным номером.
 */
export function formatJidToPhone(jid?: string | null): string | null {
  if (!jid) return null;
  const trimmed = jid.trim();
  if (trimmed.toLowerCase().endsWith("@lid")) return null;
  const digits = trimmed.split("@")[0].split(":")[0].replace(/[^\d]/g, "");
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

function formatFetchError(baseUrl: string, err: unknown): string {
  if (!(err instanceof Error)) {
    return `Ошибка сети при подключении к ${baseUrl}`;
  }
  const cause = (err as Error & { cause?: Record<string, unknown> }).cause;
  const code = cause && typeof cause.code === "string" ? cause.code : "";
  const causeMsg = cause && typeof cause.message === "string" ? cause.message : "";
  const detail = [code, causeMsg && causeMsg !== err.message ? causeMsg : ""]
    .filter(Boolean)
    .join(": ");
  return detail
    ? `Ошибка сети при подключении к ${baseUrl}: ${err.message} (${detail})`
    : `Ошибка сети при подключении к ${baseUrl}: ${err.message}`;
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

  const attemptErrors: string[] = [];

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
        signal: init?.signal || AbortSignal.timeout(8000),
      });

      preferredBaseUrlCache.set(rawApiUrl.trim(), baseUrl);

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
      preferredBaseUrlCache.delete(rawApiUrl.trim());
      attemptErrors.push(formatFetchError(baseUrl, err));
      // Пробуем следующий URL-кандидат только при сетевой ошибке
    }
  }

  return {
    ok: false,
    status: 0,
    error: attemptErrors.join(" | ") || "Не удалось подключиться к серверу Evolution API",
  };
}

export async function resolveQrDataUrl(payload: Record<string, unknown> | undefined): Promise<{
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
 * Если связь с Evolution API идёт по внутренней сети Docker (`http://evolution-api:8080` и т.п.),
 * вебхук автоматически направляется напрямую на внутренний адрес CRM (`http://dama-crm:3000/api/webhooks/whatsapp`),
 * чтобы избежать блокировки Hairpin NAT на одном VPS.
 */
export async function setEvolutionWebhook(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl: string;
  preferredEvoBaseUrl?: string;
}): Promise<{ ok: boolean; error?: string; effectiveWebhookUrl?: string }> {
  const { apiUrl, apiKey, instanceName, webhookUrl, preferredEvoBaseUrl } = params;
  if (!webhookUrl || webhookUrl.startsWith("/")) {
    return { ok: false, error: "Укажите полный публичный URL вебхука (https://...)" };
  }

  const probeBase =
    preferredEvoBaseUrl || preferredBaseUrlCache.get(apiUrl.trim()) || "";
  const internalWebhookOverride = (process.env.CRM_INTERNAL_WEBHOOK_URL || "").trim();
  const isSameVpsWebhook = webhookUrl.includes("crm.da-marketing.pro");

  const effectiveWebhookUrl =
    internalWebhookOverride && isSameVpsWebhook
      ? internalWebhookOverride
      : isInternalDockerBaseUrl(probeBase) && isSameVpsWebhook
      ? "http://dama-crm:3000/api/webhooks/whatsapp"
      : webhookUrl;

  const res = await evoFetch(apiUrl, apiKey, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: effectiveWebhookUrl,
        byEvents: false,
        base64: true,
        events: [
          "MESSAGES_UPSERT",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
          "LABELS_ASSOCIATION",
          "LABELS_EDIT",
        ],
      },
    }),
  });

  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  return { ok: true, effectiveWebhookUrl };
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

function summarizeEvoQrPayload(
  payload: Record<string, unknown> | undefined,
  stateHint?: string
): string {
  if (!payload) return `state=${stateHint || "unknown"}, пустой ответ`;
  const qrBlock = (payload.qrcode as Record<string, unknown> | undefined) || payload;
  const instBlock = payload.instance as Record<string, unknown> | undefined;
  const keys = Object.keys(payload).slice(0, 6).join(",");
  const count = payload.count ?? qrBlock.count ?? "-";
  const state = instBlock?.state || stateHint || "-";
  return `state=${String(state)}, count=${String(count)}, keys=[${keys}]`;
}

async function pollConnectForQr(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  attempts: number;
  delayMs?: number;
  pairingDigits?: string;
}): Promise<{
  ok: boolean;
  connected?: boolean;
  qrBase64?: string | null;
  pairingCode?: string | null;
  lastPayload?: Record<string, unknown>;
  error?: string;
}> {
  const { apiUrl, apiKey, instanceName, attempts, delayMs = 900, pairingDigits } = params;
  let lastPayload: Record<string, unknown> | undefined;
  const connectPath = pairingDigits
    ? `/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(pairingDigits)}`
    : `/instance/connect/${encodeURIComponent(instanceName)}`;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const connectRes = await evoFetch<Record<string, unknown>>(
      apiUrl,
      apiKey,
      connectPath,
      { method: "GET" }
    );

    if (!connectRes.ok) {
      return {
        ok: false,
        error: connectRes.error || "Не удалось получить QR-код от Evolution API",
      };
    }

    lastPayload = connectRes.data;
    const instState = String(
      (connectRes.data?.instance as Record<string, unknown> | undefined)?.state || ""
    ).toLowerCase();
    if (instState === "open") {
      return { ok: true, connected: true, qrBase64: null, lastPayload };
    }

    const qr = await resolveQrDataUrl(connectRes.data);
    if (qr.qrBase64 || qr.pairingCode) {
      return {
        ok: true,
        connected: false,
        qrBase64: qr.qrBase64,
        pairingCode: qr.pairingCode,
        lastPayload,
      };
    }

    if (attempt < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { ok: true, connected: false, qrBase64: null, pairingCode: null, lastPayload };
}

async function restartDisconnectedInstance(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}): Promise<boolean> {
  const path = `/instance/restart/${encodeURIComponent(params.instanceName)}`;
  let res = await evoFetch(params.apiUrl, params.apiKey, path, { method: "POST" });
  if (!res.ok && (res.status === 404 || res.status === 405)) {
    res = await evoFetch(params.apiUrl, params.apiKey, path, { method: "PUT" });
  }
  return res.ok;
}

/**
 * Создает инстанс при необходимости, прописывает Webhook и возвращает реальный QR-код или Pairing Code WhatsApp Web.
 */
export async function ensureInstanceAndGetQr(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  webhookUrl?: string;
  forceReset?: boolean;
  pairingPhone?: string;
}): Promise<{
  success: boolean;
  connected?: boolean;
  qrBase64?: string | null;
  pairingCode?: string | null;
  awaitingWebhook?: boolean;
  diagnostic?: string;
  phoneNumber?: string | null;
  webhookConfigured?: boolean;
  webhookError?: string;
  error?: string;
}> {
  const { apiUrl, apiKey, instanceName, webhookUrl, forceReset, pairingPhone } = params;
  const pairingDigits = pairingPhone ? pairingPhone.replace(/\D/g, "") : "";
  const effectivePairingDigits = pairingDigits.length >= 10 ? pairingDigits : undefined;

  const currentStatus = await getEvolutionStatus({ apiUrl, apiKey, instanceName });
  if (!currentStatus.ok) {
    return { success: false, error: currentStatus.error };
  }

  let webhookConfigured = false;
  let webhookError: string | undefined;

  const syncWebhook = async () => {
    if (!webhookUrl) return;
    const wh = await setEvolutionWebhook({ apiUrl, apiKey, instanceName, webhookUrl });
    webhookConfigured = wh.ok;
    webhookError = wh.error;
  };

  if (currentStatus.state === "open") {
    await syncWebhook();
    return {
      success: true,
      connected: true,
      qrBase64: null,
      phoneNumber: currentStatus.phoneNumber,
      webhookConfigured,
      webhookError,
    };
  }

  const createInstanceWithQr = async () => {
    return evoFetch<Record<string, unknown>>(apiUrl, apiKey, "/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        ...(effectivePairingDigits ? { number: effectivePairingDigits } : {}),
      }),
    });
  };

  let createPayload: Record<string, unknown> | undefined;
  let sessionRecreated = false;

  if (forceReset && currentStatus.state !== "not_found") {
    const delRes = await evoFetch(
      apiUrl,
      apiKey,
      `/instance/delete/${encodeURIComponent(instanceName)}`,
      { method: "DELETE" }
    );
    if (!delRes.ok && delRes.status !== 404) {
      return { success: false, error: delRes.error || "Не удалось сбросить сессию инстанса" };
    }
    await new Promise((r) => setTimeout(r, 700));
    const recreateRes = await createInstanceWithQr();
    if (!recreateRes.ok) {
      return { success: false, error: recreateRes.error || "Не удалось пересоздать инстанс" };
    }
    createPayload = recreateRes.data;
    sessionRecreated = true;
  } else if (currentStatus.state === "not_found") {
    const createRes = await createInstanceWithQr();
    if (!createRes.ok) {
      return { success: false, error: createRes.error || "Не удалось создать инстанс" };
    }
    createPayload = createRes.data;
    sessionRecreated = true;
  }

  await syncWebhook();

  // Пробуем достать QR/Pairing Code сразу из ответа создания
  let qr = await resolveQrDataUrl(createPayload);
  let lastPayload = createPayload;

  // Если ещё не получено (или инстанс уже существовал), вызываем /instance/connect
  if (!qr.qrBase64 && !(effectivePairingDigits && qr.pairingCode)) {
    const poll1 = await pollConnectForQr({
      apiUrl,
      apiKey,
      instanceName,
      attempts: 3,
      pairingDigits: effectivePairingDigits,
    });
    if (!poll1.ok) {
      return { success: false, error: poll1.error };
    }
    if (poll1.connected) {
      return {
        success: true,
        connected: true,
        qrBase64: null,
        webhookConfigured,
        webhookError,
      };
    }
    qr = { qrBase64: poll1.qrBase64 || null, pairingCode: poll1.pairingCode || null };
    lastPayload = poll1.lastPayload || lastPayload;
  }

  // Если существующий отключенный инстанс завис и не отдает QR — перезапускаем или пересоздаем сессию
  if (!qr.qrBase64 && !(effectivePairingDigits && qr.pairingCode) && !sessionRecreated) {
    const restarted = await restartDisconnectedInstance({ apiUrl, apiKey, instanceName });
    if (restarted) {
      await new Promise((r) => setTimeout(r, 1200));
      const pollRestart = await pollConnectForQr({
        apiUrl,
        apiKey,
        instanceName,
        attempts: 2,
        pairingDigits: effectivePairingDigits,
      });
      if (pollRestart.ok && pollRestart.connected) {
        return { success: true, connected: true, qrBase64: null, webhookConfigured, webhookError };
      }
      if (pollRestart.ok && (pollRestart.qrBase64 || pollRestart.pairingCode)) {
        qr = {
          qrBase64: pollRestart.qrBase64 || null,
          pairingCode: pollRestart.pairingCode || null,
        };
      }
      lastPayload = pollRestart.lastPayload || lastPayload;
    }

    if (!qr.qrBase64 && !(effectivePairingDigits && qr.pairingCode)) {
      const delRes = await evoFetch(
        apiUrl,
        apiKey,
        `/instance/delete/${encodeURIComponent(instanceName)}`,
        { method: "DELETE" }
      );
      if (delRes.ok || delRes.status === 404) {
        await new Promise((r) => setTimeout(r, 700));
        const recreateRes = await createInstanceWithQr();
        if (recreateRes.ok) {
          await syncWebhook();
          qr = await resolveQrDataUrl(recreateRes.data);
          lastPayload = recreateRes.data || lastPayload;
          if (!qr.qrBase64 && !(effectivePairingDigits && qr.pairingCode)) {
            const pollRecreate = await pollConnectForQr({
              apiUrl,
              apiKey,
              instanceName,
              attempts: 2,
              pairingDigits: effectivePairingDigits,
            });
            if (pollRecreate.ok && (pollRecreate.qrBase64 || pollRecreate.pairingCode)) {
              qr = {
                qrBase64: pollRecreate.qrBase64 || null,
                pairingCode: pollRecreate.pairingCode || null,
              };
            }
            lastPayload = pollRecreate.lastPayload || lastPayload;
          }
        }
      }
    }
  }

  if (!qr.qrBase64 && !qr.pairingCode) {
    const diagnostic = summarizeEvoQrPayload(lastPayload, currentStatus.state);
    return {
      success: true,
      connected: false,
      qrBase64: null,
      pairingCode: null,
      awaitingWebhook: true,
      diagnostic,
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
  customDelayMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { apiUrl, apiKey, instanceName, to, messageType, textContent, mediaUrl, fileName, customDelayMs } = params;
  const number = formatNumberForEvolution(to);
  const encodedInstance = encodeURIComponent(instanceName);

  // Антиспам-защита: рандомизированная имитация набора текста человеком (1800-3200 мс)
  // Для WhatsApp сокетов это эмулирует статус "печатает..." и предотвращает флаг скрипт-бота
  const typingDelay =
    typeof customDelayMs === "number" && customDelayMs >= 0
      ? customDelayMs
      : Math.floor(Math.random() * 1400) + 1800;

  // Отправляем явный presence-сигнал набора текста или аудиозаписи
  evoFetch(apiUrl, apiKey, `/chat/sendPresence/${encodedInstance}`, {
    method: "POST",
    body: JSON.stringify({
      number,
      presence: messageType === WhatsappMessageType.AUDIO ? "recording" : "composing",
      delay: typingDelay,
    }),
  }).catch(() => null);

  if (messageType === WhatsappMessageType.TEXT) {
    const res = await evoFetch(apiUrl, apiKey, `/message/sendText/${encodedInstance}`, {
      method: "POST",
      body: JSON.stringify({
        number,
        text: textContent || "",
        delay: typingDelay,
        linkPreview: false,
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
        delay: typingDelay,
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
        delay: typingDelay,
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
      delay: typingDelay,
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

export interface EvolutionLabelInfo {
  id: string;
  name: string;
  color?: string;
}

export interface EvolutionContactInfo {
  remoteJid: string;
  remoteJidAlt?: string;
  displayName: string;
}

export interface EvolutionChatInfo {
  jid: string;
  phone: string;
  displayName: string;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  archived: boolean;
  labels: string[];
}

function normalizeArrayPayload(payload: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const k of keys) {
      if (Array.isArray(obj[k])) {
        return (obj[k] as unknown[]).filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object")
        );
      }
    }
  }
  return [];
}

/**
 * Получает список ярлыков WhatsApp Business (Списки / Labels) с шлюза Evolution API v2.
 */
export async function fetchEvolutionLabels(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}): Promise<{ ok: boolean; labels: EvolutionLabelInfo[]; error?: string }> {
  const res = await evoFetch<unknown>(
    params.apiUrl,
    params.apiKey,
    `/label/findLabels/${encodeURIComponent(params.instanceName)}`,
    { method: "GET" }
  );

  if (!res.ok) {
    return { ok: false, labels: [], error: res.error };
  }

  const rawList = normalizeArrayPayload(res.data, ["labels", "data", "records"]);
  const labels: EvolutionLabelInfo[] = [];

  for (const item of rawList) {
    const id = item.id ?? item.labelId;
    const name = item.name ?? item.labelName ?? item.title;
    if (id != null && typeof name === "string" && name.trim()) {
      labels.push({
        id: String(id),
        name: name.trim(),
        color: item.color != null ? String(item.color) : undefined,
      });
    }
  }

  return { ok: true, labels };
}

/**
 * Получает контакты с шлюза Evolution API v2 (помогает восстановить имена и сопоставить @lid -> телефон).
 */
export async function fetchEvolutionContacts(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}): Promise<{ ok: boolean; contacts: EvolutionContactInfo[]; error?: string }> {
  const res = await evoFetch<unknown>(
    params.apiUrl,
    params.apiKey,
    `/chat/findContacts/${encodeURIComponent(params.instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );

  if (!res.ok) {
    return { ok: false, contacts: [], error: res.error };
  }

  const rawList = normalizeArrayPayload(res.data, ["contacts", "data", "records"]);
  const contacts: EvolutionContactInfo[] = [];

  for (const item of rawList) {
    const remoteJid =
      (typeof item.remoteJid === "string" && item.remoteJid) ||
      (typeof item.id === "string" && item.id) ||
      "";
    if (!remoteJid) continue;

    const remoteJidAlt =
      typeof item.remoteJidAlt === "string" && item.remoteJidAlt ? item.remoteJidAlt : undefined;

    const displayName =
      (typeof item.name === "string" && item.name.trim()) ||
      (typeof item.pushName === "string" && item.pushName.trim()) ||
      (typeof item.verifiedName === "string" && item.verifiedName.trim()) ||
      "";

    contacts.push({ remoteJid, remoteJidAlt, displayName });
  }

  return { ok: true, contacts };
}

function extractChatLastMessagePreview(lastMessage: unknown): string | null {
  if (!lastMessage || typeof lastMessage !== "object") return null;
  const lm = lastMessage as Record<string, unknown>;
  const msg = (lm.message && typeof lm.message === "object"
    ? lm.message
    : lm) as Record<string, unknown>;

  const text =
    (typeof msg.conversation === "string" && msg.conversation) ||
    (typeof (msg.extendedTextMessage as Record<string, unknown> | undefined)?.text === "string" &&
      String((msg.extendedTextMessage as Record<string, unknown>).text)) ||
    (typeof (msg.imageMessage as Record<string, unknown> | undefined)?.caption === "string" &&
      String((msg.imageMessage as Record<string, unknown>).caption)) ||
    (msg.imageMessage ? "[Фото]" : null) ||
    (msg.audioMessage || msg.pttMessage ? "[Голосовое сообщение]" : null) ||
    (msg.documentMessage ? "[Документ]" : null) ||
    (msg.videoMessage ? "[Видео]" : null) ||
    (typeof lm.text === "string" ? lm.text : null);

  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed;
}

function extractTimestampIso(rawTs: unknown, fallbackIso: unknown): string | null {
  if (typeof rawTs === "number" && Number.isFinite(rawTs) && rawTs > 0) {
    const ms = rawTs < 10_000_000_000 ? rawTs * 1000 : rawTs;
    return new Date(ms).toISOString();
  }
  if (typeof rawTs === "string" && /^\d+$/.test(rawTs.trim())) {
    const num = Number(rawTs.trim());
    const ms = num < 10_000_000_000 ? num * 1000 : num;
    return new Date(ms).toISOString();
  }
  if (typeof fallbackIso === "string" && fallbackIso.trim()) {
    const parsed = new Date(fallbackIso);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

/**
 * Загружает список текущих личных диалогов из Evolution API v2 (POST /chat/findChats)
 * с обогащением имен из контактов WhatsApp. Группы и рассылки статусов отфильтровываются.
 */
export async function fetchEvolutionChats(params: {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  labelNameById?: Map<string, string>;
}): Promise<{ ok: boolean; chats: EvolutionChatInfo[]; error?: string }> {
  const [chatsRes, contactsRes] = await Promise.all([
    evoFetch<unknown>(
      params.apiUrl,
      params.apiKey,
      `/chat/findChats/${encodeURIComponent(params.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    ),
    fetchEvolutionContacts(params).catch(() => ({ ok: false, contacts: [] as EvolutionContactInfo[] })),
  ]);

  if (!chatsRes.ok) {
    return { ok: false, chats: [], error: chatsRes.error };
  }

  const contactByJid = new Map<string, EvolutionContactInfo>();
  for (const c of contactsRes.contacts) {
    contactByJid.set(c.remoteJid, c);
    if (c.remoteJidAlt) contactByJid.set(c.remoteJidAlt, c);
  }

  const rawList = normalizeArrayPayload(chatsRes.data, ["chats", "data", "records"]);
  const seenJids = new Set<string>();
  const chats: EvolutionChatInfo[] = [];

  for (const item of rawList) {
    const rawJid =
      (typeof item.remoteJid === "string" && item.remoteJid) ||
      (typeof item.id === "string" && item.id) ||
      "";
    if (!rawJid) continue;
    if (
      item.isGroup === true ||
      rawJid.endsWith("@g.us") ||
      rawJid === "status@broadcast" ||
      rawJid.endsWith("@newsletter")
    ) {
      continue;
    }

    const lastMessage = item.lastMessage as Record<string, unknown> | undefined;
    const lmKey = lastMessage?.key as Record<string, unknown> | undefined;
    const contactMatch = contactByJid.get(rawJid);

    const candidateJids = [
      rawJid,
      typeof item.remoteJidAlt === "string" ? item.remoteJidAlt : "",
      typeof lmKey?.remoteJidAlt === "string" ? lmKey.remoteJidAlt : "",
      typeof lmKey?.senderPn === "string" ? lmKey.senderPn : "",
      contactMatch?.remoteJidAlt || "",
      contactMatch?.remoteJid || "",
    ].filter(Boolean);

    const resolvedJid =
      candidateJids.find((j) => !j.endsWith("@lid")) || candidateJids[0] || rawJid;

    const phone = formatJidToPhone(resolvedJid) || resolvedJid;
    if (!phone || seenJids.has(phone)) continue;
    seenJids.add(phone);

    const displayName =
      (contactMatch?.displayName && contactMatch.displayName.trim()) ||
      (typeof item.name === "string" && item.name.trim()) ||
      (typeof item.pushName === "string" && item.pushName.trim()) ||
      (typeof lastMessage?.pushName === "string" && lastMessage.pushName.trim()) ||
      phone;

    const lastMessageText = extractChatLastMessagePreview(lastMessage);
    const lastMessageAt = extractTimestampIso(lastMessage?.messageTimestamp, item.updatedAt);

    const rawLabels = Array.isArray(item.labels) ? item.labels : [];
    const labelSet = new Set<string>();
    for (const l of rawLabels) {
      let resolvedLabel = "";
      if (typeof l === "string") {
        const key = l.trim();
        resolvedLabel = params.labelNameById?.get(key) || key;
      } else if (l && typeof l === "object") {
        const obj = l as Record<string, unknown>;
        if (typeof obj.name === "string" && obj.name.trim()) {
          resolvedLabel = obj.name.trim();
        } else if (obj.id != null || obj.labelId != null) {
          const key = String(obj.id ?? obj.labelId).trim();
          resolvedLabel = params.labelNameById?.get(key) || key;
        }
      }
      if (resolvedLabel) labelSet.add(resolvedLabel);
    }

    chats.push({
      jid: resolvedJid,
      phone,
      displayName,
      lastMessageText,
      lastMessageAt,
      archived: Boolean(item.archived),
      labels: Array.from(labelSet),
    });
  }

  chats.sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return tb - ta;
  });

  return { ok: true, chats };
}
