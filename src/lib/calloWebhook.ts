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
  headersSummary?: string;
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


function isUnresolvedTemplatePlaceholder(val?: string | null): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    trimmed.startsWith("{") ||
    trimmed.startsWith("%") ||
    trimmed.startsWith("[") ||
    trimmed.includes("ct_phone") ||
    trimmed.includes("ct_call_id") ||
    trimmed === "undefined" ||
    trimmed === "null"
  );
}

function pickParam(params: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const val = params[key];
    if (typeof val === "string" && val.trim() && !isUnresolvedTemplatePlaceholder(val)) {
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
  // 1. Прямые ключи номера клиента (включая ct_*, dst, callee, subscriber и т.д.)
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
    "dst",
    "callee",
    "destination",
    "called",
    "contact",
    "client",
    "lead_phone",
    "contact_phone",
    "src",
    "to",
    "msisdn",
    "tel",
    "number",
  ]);
  if (direct && !isUnresolvedTemplatePlaceholder(direct)) return direct;

  const phone9Raw = pickParam(params, ["ct_phone9", "phone9"]);
  if (phone9Raw && !isUnresolvedTemplatePlaceholder(phone9Raw)) {
    const phone9 = phone9Raw.replace(/[^\d]/g, "");
    if (phone9.length === 10 || phone9.length === 9) return `+7${phone9}`;
    if (phone9.length >= 7) return phone9;
  }

  // 2. Поиск по ключам, содержащим маркеры телефона или абонента
  for (const [key, val] of Object.entries(params)) {
    if (!/phone|tel|caller|callee|abonent|msisdn|dst|dest|subscriber|called|number/i.test(key)) continue;
    const trimmed = val?.trim();
    if (!trimmed || isUnresolvedTemplatePlaceholder(trimmed)) continue;
    const parsed = extractPhoneKeyAndRaw(trimmed);
    if (parsed && !parsed.isLid && parsed.phoneKey.length >= 7) {
      return trimmed;
    }
  }

  // 3. Универсальный поиск: если в ЛЮБОМ значении передан валидный номер телефона (10-12 цифр)
  for (const [, val] of Object.entries(params)) {
    const trimmed = typeof val === "string" ? val.trim() : "";
    if (!trimmed || trimmed.length < 10 || isUnresolvedTemplatePlaceholder(trimmed)) continue;
    const parsed = extractPhoneKeyAndRaw(trimmed);
    if (
      parsed &&
      !parsed.isLid &&
      (parsed.phoneKey.startsWith("7") || parsed.phoneKey.startsWith("8") || parsed.phoneKey.length >= 10) &&
      parsed.phoneKey.length <= 13
    ) {
      return trimmed;
    }
  }

  return "";
}

export async function extractCalloParamsFromRequest(
  req: Request
): Promise<{ params: Record<string, string>; rawBody?: string; headersSummary?: string }> {
  const collected: Record<string, string> = {};

  try {
    const url = new URL(req.url);
    url.searchParams.forEach((value, key) => {
      if (value) collected[key] = value.trim();
    });
  } catch {
    // ignore malformed url
  }

  // Считываем полезные заголовки, если телефония присылает данные в headers
  const headersList: string[] = [];
  try {
    req.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!/authorization|cookie|secret|token|password/i.test(lower)) {
        headersList.push(`${key}: ${value}`);
      }
      if (
        lower.startsWith("ct_") ||
        lower.startsWith("ct-") ||
        lower.startsWith("x-call") ||
        /phone|caller|callee|abonent/i.test(key)
      ) {
        if (!collected[key]) {
          collected[key] = value.trim();
        }
      }
    });
  } catch {
    // ignore
  }

  const headersSummary = headersList.slice(0, 10).join("; ");

  if (req.method !== "POST" && req.method !== "PUT") {
    return { params: collected, headersSummary };
  }

  let rawText = "";
  try {
    rawText = (await req.text()).trim();
  } catch {
    // stream might be already consumed or unavailable
  }

  if (rawText) {
    // 1. Попытка разобрать как JSON
    if (rawText.startsWith("{") || rawText.startsWith("[")) {
      try {
        const json = JSON.parse(rawText);
        flattenJsonIntoParams(json, collected);
      } catch {
        // не JSON
      }
    }

    // 2. Попытка разобрать как URL-encoded / multipart form
    if (rawText.includes("=")) {
      try {
        const sp = new URLSearchParams(rawText);
        sp.forEach((value, key) => {
          if (value && !collected[key]) {
            collected[key] = value.trim();
          }
        });
      } catch {
        // ignore
      }
    }
  }

  return {
    params: collected,
    rawBody: rawText ? rawText.slice(0, 1000) : undefined,
    headersSummary,
  };
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

export async function ensureAutodialerStageIsUnsorted() {
  const allPipelines = await prisma.pipeline.findMany({
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const targetPipeline =
    allPipelines.find((p) => p.name.trim().toLowerCase().includes("холодный автообзвон")) ||
    allPipelines.find((p) => p.isDefault) ||
    allPipelines[0];

  if (!targetPipeline) return null;

  let targetStage = targetPipeline.stages.find((s) =>
    s.name.trim().toLowerCase().includes("неразобран")
  );

  // Если этапа с корнем «неразобран» нет, переименовываем первый этап («Новый лид») в «Неразобранные»
  if (!targetStage) {
    const candidateStage =
      targetPipeline.stages.find((s) =>
        s.name.trim().toLowerCase().includes("новый лид")
      ) ||
      targetPipeline.stages.find((s) => s.type === "OPEN") ||
      targetPipeline.stages[0];

    if (candidateStage) {
      targetStage = await prisma.stage.update({
        where: { id: candidateStage.id },
        data: { name: "Неразобранные" },
      });
    }
  } else {
    // Если отдельный этап «Неразобранные» есть, проверяем, не остались ли в «Новый лид» лиды автообзвона
    const oldStage = targetPipeline.stages.find(
      (s) =>
        s.id !== targetStage!.id &&
        s.name.trim().toLowerCase().includes("новый лид")
    );
    if (oldStage) {
      await prisma.deal.updateMany({
        where: {
          pipelineId: targetPipeline.id,
          stageId: oldStage.id,
        },
        data: { stageId: targetStage.id },
      });
    }
  }

  return { targetPipeline, targetStage };
}

export async function processCalloLeadWebhook(
  rawParams: Record<string, string>,
  options?: {
    instanceId?: string;
    isTest?: boolean;
    method?: string;
    rawBody?: string;
    headersSummary?: string;
  }
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
  const effectiveSummary =
    rawSummary !== "(пустой запрос без параметров)"
      ? rawSummary
      : options?.rawBody
      ? `raw: ${options.rawBody.slice(0, 300)}`
      : rawSummary;

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
        : "Входящий запрос от Callo получен (200 OK), но номер абонента пустой. В Callo в URL используйте макросы (?ct_phone={ct_phone}&phone={phone}) или укажите чистый Postback URL без знака вопроса",
      rawSummary: effectiveSummary,
      headersSummary: options?.headersSummary,
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
      message:
        "Вебхук получен CRM (200 OK), но номер абонента пустой. В Callo переключите «Метод» на GET либо вставьте JSON через ссылку «Своё тело запроса (JSON) — для профессионалов».",
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
        customFields: {
          "Источник лида": "Автообзвон",
        },
      },
      include: {
        deals: {
          include: { stage: true },
        },
      },
    });
  }

  // Находим воронку «Холодный автообзвон» и этап «Неразобранные»
  const stageInfo = await ensureAutodialerStageIsUnsorted();
  const targetPipeline = stageInfo?.targetPipeline;
  const targetStage = stageInfo?.targetStage;

  let dealId: string | null = null;
  let createdDeal = false;

  if (targetPipeline && targetStage) {
    const existingOpenDeal = contact.deals.find(
      (d) => d.pipelineId === targetPipeline.id && d.stage.type === "OPEN"
    );

    if (existingOpenDeal) {
      dealId = existingOpenDeal.id;
      // Если у контакта уже была открытая сделка, перемещаем её на начальный этап («Новый лид»),
      // чтобы новый отклик сразу появился в начале воронки для распределения
      if (existingOpenDeal.stageId !== targetStage.id) {
        await prisma.deal.update({
          where: { id: existingOpenDeal.id },
          data: {
            stageId: targetStage.id,
            updatedAt: new Date(),
          },
        });
      }
    } else {
      const newDeal = await prisma.deal.create({
        data: {
          title: clientName
            ? `Автообзвон: ${clientName}`
            : `Лид автообзвон (${cleanPhone})`,
          contactId: contact.id,
          pipelineId: targetPipeline.id,
          stageId: targetStage.id,
          assignedToId: assignedUserId,
          totalBudget: 0,
          currency: "KZT",
          customFields: {
            source: "Автообзвон",
          },
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
    message: createdDeal
      ? `Лид успешно добавлен в CRM: ${cleanPhone} → «${targetPipeline?.name}» / «${targetStage?.name}»`
      : `Лид обновлен в CRM: ${cleanPhone} в «${targetPipeline?.name || "CRM"}»`,
  };
}
