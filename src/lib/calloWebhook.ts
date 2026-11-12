import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { extractPhoneKeyAndRaw } from "@/lib/whatsappFilterUtils";

export interface CalloLastWebhookDebug {
  receivedAt: string;
  phone: string;
  method?: string;
  callId?: string;
  campaignId?: string;
  buttonNum?: string;
  callStatus?: string;
  outcome: "processed" | "deduplicated" | "ignored" | "error";
  contactId?: string;
  dealId?: string | null;
  pipelineName?: string;
  stageName?: string;
  isNewContact?: boolean;
  note?: string;
  rawSummary?: string;
}

function getCalloSecretBase(): string {
  return (
    process.env.CALLO_WEBHOOK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dama-crm-callo-webhook-key"
  );
}

export function generateCalloWebhookToken(instanceId: string): string {
  return crypto
    .createHmac("sha256", getCalloSecretBase())
    .update(`callo:${instanceId}`)
    .digest("hex")
    .slice(0, 24);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyCalloWebhookToken(
  token: string | null | undefined,
  instanceId: string
): boolean {
  const provided = (token || "").trim();
  if (!provided) return false;

  const expectedDerived = generateCalloWebhookToken(instanceId);
  if (timingSafeEqualStr(provided, expectedDerived)) return true;

  const envSecret = (process.env.CALLO_WEBHOOK_SECRET || "").trim();
  if (envSecret && timingSafeEqualStr(provided, envSecret)) return true;

  return false;
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Allow direct execution in CLI verification tests outside Next.js request scope
  }
}

function pickParam(params: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const val = params[key];
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }
  return "";
}

export function summarizeCalloParams(params: Record<string, string>): string {
  const safeEntries = Object.entries(params)
    .filter(([k, v]) => {
      const lower = k.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("password") ||
        lower === "auth"
      ) {
        return false;
      }
      return typeof v === "string" && v.trim().length > 0;
    })
    .map(([k, v]) => `${k}=${v.trim()}`);

  if (safeEntries.length === 0) return "(пустой запрос без параметров)";
  const joined = safeEntries.join(", ");
  return joined.length > 360 ? `${joined.slice(0, 357)}...` : joined;
}

function flattenJsonIntoParams(
  input: unknown,
  out: Record<string, string>,
  prefix = "",
  depth = 0
) {
  if (depth > 4 || input === null || input === undefined) return;

  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    const val = String(input).trim();
    if (!val || !prefix) return;
    out[prefix] = val;
    const leaf = prefix.split(".").pop();
    if (leaf && !out[leaf]) {
      out[leaf] = val;
    }
    return;
  }

  if (Array.isArray(input)) {
    if (input.length > 0) {
      flattenJsonIntoParams(input[0], out, prefix, depth + 1);
    }
    return;
  }

  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      const nextKey = prefix ? `${prefix}.${k}` : k;
      flattenJsonIntoParams(v, out, nextKey, depth + 1);
    }
  }
}

function normalizeCalloPhoneInput(params: Record<string, string>): string {
  const direct = pickParam(params, [
    "ct_phone",
    "ct_phone8",
    "callerphone",
    "caller_phone",
    "client_phone",
    "phone",
    "caller",
    "ct_caller",
    "abonent",
    "subscriber",
    "src",
    "to",
    "msisdn",
    "tel",
    "number",
  ]);
  if (direct) return direct;

  const phone9 = pickParam(params, ["ct_phone9", "phone9"]).replace(/[^\d]/g, "");
  if (phone9) {
    if (phone9.length === 10 || phone9.length === 9) return `+7${phone9}`;
    return phone9;
  }

  // Fallback эвристика по ключам, содержащим phone/tel/caller/abonent/msisdn
  for (const [key, val] of Object.entries(params)) {
    if (!/phone|tel|caller|abonent|msisdn/i.test(key)) continue;
    const trimmed = val?.trim();
    if (!trimmed) continue;
    const parsed = extractPhoneKeyAndRaw(trimmed);
    if (parsed && !parsed.isLid && parsed.phoneKey.length >= 7) {
      return trimmed;
    }
  }

  return "";
}

export async function extractCalloParamsFromRequest(
  req: Request
): Promise<Record<string, string>> {
  const collected: Record<string, string> = {};

  try {
    const url = new URL(req.url);
    url.searchParams.forEach((value, key) => {
      if (value) collected[key] = value;
    });
  } catch {
    // ignore malformed url
  }

  if (req.method !== "POST") {
    return collected;
  }

  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  try {
    if (contentType.includes("application/json")) {
      const json = await req.json();
      flattenJsonIntoParams(json, collected);
      return collected;
    }

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      form.forEach((value, key) => {
        if (typeof value === "string" && value.trim()) {
          collected[key] = value.trim();
        }
      });
      return collected;
    }

    const rawText = (await req.text()).trim();
    if (!rawText) return collected;

    if (rawText.startsWith("{") || rawText.startsWith("[")) {
      const parsed = JSON.parse(rawText) as unknown;
      flattenJsonIntoParams(parsed, collected);
    } else if (rawText.includes("=")) {
      const sp = new URLSearchParams(rawText);
      sp.forEach((value, key) => {
        if (value) collected[key] = value;
      });
    }
  } catch {
    // Ignore empty/unparseable POST body if query params were supplied
  }

  return collected;
}

export async function getDefaultWhatsappInstanceForCallo() {
  return (
    (await prisma.whatsappInstance.findFirst({ where: { isDefault: true } })) ||
    (await prisma.whatsappInstance.findFirst())
  );
}

export async function saveLastCalloWebhookDebug(
  instanceId: string | undefined,
  debug: CalloLastWebhookDebug
) {
  if (!instanceId) return;
  try {
    await prisma.whatsappInstance.update({
      where: { id: instanceId },
      data: {
        lastCalloWebhook: debug as unknown as object,
      },
    });
  } catch {
    // Non-critical telemetry write
  }
}

export async function processCalloLeadWebhook(
  rawParams: Record<string, string>,
  options?: { instanceId?: string; isTest?: boolean; method?: string }
) {
  const phoneInput = normalizeCalloPhoneInput(rawParams);
  const callId = pickParam(rawParams, ["ct_call_id", "call_id", "callId", "id"]);
  const campaignId = pickParam(rawParams, ["ct_campaign_id", "campaign_id", "campaignId"]);
  const buttonNum = pickParam(rawParams, ["ct_button_num", "button_num", "button", "digit", "dtmf"]);
  const callStatus = pickParam(rawParams, ["ct_status", "status"]);
  const dialStatus = pickParam(rawParams, ["ct_dial_status", "dial_status"]);
  const duration = pickParam(rawParams, ["ct_duration", "duration"]);
  const completedAt = pickParam(rawParams, ["ct_completed", "completed_at"]);
  const transcribing = pickParam(rawParams, ["ct_transcribing", "transcribing"]);
  const clientName = pickParam(rawParams, ["ct_name", "name", "client_name"]);
  const rawSummary = summarizeCalloParams(rawParams);

  const instanceId =
    options?.instanceId || (await getDefaultWhatsappInstanceForCallo())?.id;

  const normalizedPhone = extractPhoneKeyAndRaw(phoneInput);
  if (!normalizedPhone || normalizedPhone.isLid || normalizedPhone.phoneKey.length < 7) {
    await saveLastCalloWebhookDebug(instanceId, {
      receivedAt: new Date().toISOString(),
      phone: phoneInput || "—",
      method: options?.method,
      callId: callId || undefined,
      campaignId: campaignId || undefined,
      buttonNum: buttonNum || undefined,
      callStatus: callStatus || undefined,
      outcome: options?.isTest ? "error" : "ignored",
      note: options?.isTest
        ? "Не передан корректный номер телефона (ct_phone)"
        : "Входящий запрос/пинг без номера телефона (принят HTTP 200)",
      rawSummary,
    });

    if (options?.isTest) {
      return {
        success: false as const,
        statusCode: 400,
        error: "Не передан корректный номер телефона (ct_phone)",
      };
    }

    return {
      success: true as const,
      statusCode: 200,
      ping: true,
      warning: "ct_phone_missing",
      receivedKeys: Object.keys(rawParams).filter(
        (k) => !/token|secret|password|auth/i.test(k)
      ),
    };
  }

  const cleanPhone = normalizedPhone.rawDisplay.startsWith("+")
    ? normalizedPhone.rawDisplay
    : `+${normalizedPhone.phoneKey}`;

  // Если Callo прислал финальный статус недозвона без нажатия кнопки — не засоряем воронку
  if (
    !buttonNum &&
    ["attempts_exc", "expires", "interrupted"].includes(callStatus.toLowerCase())
  ) {
    await saveLastCalloWebhookDebug(instanceId, {
      receivedAt: new Date().toISOString(),
      phone: cleanPhone,
      method: options?.method,
      callId: callId || undefined,
      campaignId: campaignId || undefined,
      callStatus,
      outcome: "ignored",
      note: `Звонок не завершился ответом (${callStatus})`,
      rawSummary,
    });
    return {
      success: true as const,
      statusCode: 200,
      ignored: "call_not_answered",
      phone: cleanPhone,
    };
  }

  // Дедупликация повторных webhook-попыток Callo по ct_call_id
  if (!options?.isTest && callId) {
    const existingNote = await prisma.contactNote.findFirst({
      where: { content: { contains: `[callo_call_id:${callId}]` } },
      select: { contactId: true },
    });
    if (existingNote) {
      await saveLastCalloWebhookDebug(instanceId, {
        receivedAt: new Date().toISOString(),
        phone: cleanPhone,
        method: options?.method,
        callId,
        campaignId: campaignId || undefined,
        buttonNum: buttonNum || undefined,
        callStatus: callStatus || undefined,
        outcome: "deduplicated",
        contactId: existingNote.contactId,
        note: "Повторный вебхук по тому же ct_call_id пропущен",
        rawSummary,
      });
      return {
        success: true as const,
        statusCode: 200,
        deduplicated: true,
        contactId: existingNote.contactId,
        phone: cleanPhone,
      };
    }
  }

  const firstActiveUser = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const assignedUserId = firstActiveUser?.id;

  // Ищем существующий контакт с учетом различных форматов номера
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

  if (!contact && normalizedPhone.phoneKey.length >= 10) {
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

  let isNewContact = false;
  if (!contact) {
    isNewContact = true;
    contact = await prisma.contact.create({
      data: {
        name: clientName || `Лид автообзвон (${cleanPhone})`,
        phone: cleanPhone,
        company: "Автообзвон Callo",
        assignedToId: assignedUserId,
      },
      include: {
        deals: {
          include: { stage: true },
        },
      },
    });
  }

  // Находим воронку «Холодный автообзвон» и этап «Неразобранные»
  const allPipelines = await prisma.pipeline.findMany({
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const targetPipeline =
    allPipelines.find((p) => p.name.trim().toLowerCase().includes("холодный автообзвон")) ||
    allPipelines.find((p) => p.isDefault) ||
    allPipelines[0];

  const targetStage =
    targetPipeline?.stages.find((s) => s.name.trim().toLowerCase().includes("неразобран")) ||
    targetPipeline?.stages[0];

  let dealId: string | null = null;
  let createdDeal = false;

  if (targetPipeline && targetStage) {
    const existingOpenDeal = contact.deals.find(
      (d) => d.pipelineId === targetPipeline.id && d.stage.type === "OPEN"
    );

    if (existingOpenDeal) {
      dealId = existingOpenDeal.id;
    } else {
      const newDeal = await prisma.deal.create({
        data: {
          title: clientName
            ? `Автообзвон: ${clientName}`
            : `Автообзвон Callo: ${cleanPhone}`,
          contactId: contact.id,
          pipelineId: targetPipeline.id,
          stageId: targetStage.id,
          assignedToId: assignedUserId,
          totalBudget: 0,
          currency: "KZT",
        },
      });
      dealId = newDeal.id;
      createdDeal = true;
    }
  }

  if (assignedUserId) {
    const detailParts = [
      options?.isTest ? "🧪 Тестовый отклик Callo.com" : "📞 Отклик с автообзвона Callo.com",
      campaignId ? `Кампания: ${campaignId}` : null,
      buttonNum ? `Нажата цифра: ${buttonNum}` : null,
      callStatus ? `Статус: ${callStatus}` : null,
      dialStatus ? `Код дозвона: ${dialStatus}` : null,
      duration ? `Длительность: ${duration} сек` : null,
      completedAt ? `Время: ${completedAt}` : null,
      transcribing ? `Распознавание речи: «${transcribing}»` : null,
      callId ? `[callo_call_id:${callId}]` : null,
    ].filter(Boolean);

    await prisma.contactNote.create({
      data: {
        contactId: contact.id,
        authorId: assignedUserId,
        content: detailParts.join(" | "),
      },
    });
  }

  await saveLastCalloWebhookDebug(instanceId, {
    receivedAt: new Date().toISOString(),
    phone: cleanPhone,
    method: options?.method,
    callId: callId || undefined,
    campaignId: campaignId || undefined,
    buttonNum: buttonNum || undefined,
    callStatus: callStatus || undefined,
    outcome: "processed",
    contactId: contact.id,
    dealId,
    pipelineName: targetPipeline?.name,
    stageName: targetStage?.name,
    isNewContact,
    note: createdDeal
      ? `Создана сделка в «${targetPipeline?.name}» → «${targetStage?.name}»`
      : `Обновлен существующий лид в «${targetPipeline?.name || "CRM"}»`,
    rawSummary,
  });

  safeRevalidate("/deals");
  safeRevalidate("/contacts");
  safeRevalidate("/");
  safeRevalidate("/settings/whatsapp");

  return {
    success: true as const,
    statusCode: 200,
    contactId: contact.id,
    dealId,
    isNewContact,
    createdDeal,
    phone: cleanPhone,
    pipelineName: targetPipeline?.name,
    stageName: targetStage?.name,
  };
}
