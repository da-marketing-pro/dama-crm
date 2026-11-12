export const DEFAULT_DEAL_SOURCE_OPTIONS = [
  "Автообзвон",
  "Таргет Инст",
  "Таргет KZ",
  "Instagram",
  "Сайт",
  "Рекомендация",
  "Холодный звонок",
  "Выставка",
] as const;

export function buildDealSourceOptions(customOptions: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const opt of [...customOptions, ...DEFAULT_DEAL_SOURCE_OPTIONS]) {
    const trimmed = opt?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
  }
  return Array.from(seen.values());
}

function matchPreferredOption(
  canonical: string,
  availableOptions?: string[]
): string {
  if (!availableOptions || availableOptions.length === 0) return canonical;

  const lower = canonical.toLowerCase();
  const exact = availableOptions.find((o) => o.trim().toLowerCase() === lower);
  if (exact) return exact;

  if (lower.includes("автообзвон")) {
    const found = availableOptions.find((o) =>
      o.toLowerCase().includes("автообзвон")
    );
    if (found) return found;
  }

  if (lower.includes("таргет") && lower.includes("kz")) {
    const found = availableOptions.find(
      (o) =>
        o.toLowerCase().includes("таргет") &&
        (o.toLowerCase().includes("kz") || o.toLowerCase().includes("кз"))
    );
    if (found) return found;
  }

  if (lower.includes("таргет") && (lower.includes("инст") || lower.includes("инт"))) {
    const found = availableOptions.find(
      (o) =>
        o.toLowerCase().includes("таргет") &&
        (o.toLowerCase().includes("инст") ||
          o.toLowerCase().includes("инт") ||
          o.toLowerCase().includes("inst"))
    );
    if (found) return found;
  }

  return canonical;
}

const TARGET_AD_TEXT_REGEX =
  /(instagram|инстаграм|\bинст\b|facebook|fb\.me|fbclid|click-to-whatsapp|таргет|target|реклам|промо|сторис|stories|reels|рилс|узнать подробнее о вашем предложении)/i;

const TARGET_KZ_REGEX = /(\bkz\b|\bкз\b|казахстан|таргет[\s\-_]*(?:kz|кз))/i;

export function detectWhatsappLeadSource(params: {
  isFromAd?: boolean;
  adSourceApp?: string;
  adTitle?: string;
  adBody?: string;
  adSourceUrl?: string;
  textContent?: string;
  labels?: string[];
  campaignName?: string;
  availableOptions?: string[];
}): string {
  const combined = [
    params.adSourceApp,
    params.adTitle,
    params.adBody,
    params.adSourceUrl,
    params.textContent,
    params.campaignName,
    ...(params.labels || []),
  ]
    .filter(Boolean)
    .join(" ");

  const hasAdMetadata = Boolean(
    params.isFromAd ||
      params.adSourceApp ||
      params.adTitle ||
      params.adBody ||
      params.adSourceUrl
  );

  if (hasAdMetadata || TARGET_AD_TEXT_REGEX.test(combined)) {
    if (TARGET_KZ_REGEX.test(combined)) {
      return matchPreferredOption("Таргет KZ", params.availableOptions);
    }
    return matchPreferredOption("Таргет Инст", params.availableOptions);
  }

  return matchPreferredOption("Автообзвон", params.availableOptions);
}

function readCustomSourceValue(
  fields: Record<string, unknown> | null | undefined
): string | null {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return null;
  }

  for (const key of ["source", "Источник", "Источник лида", "источник"]) {
    const val = fields[key];
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }

  for (const [k, v] of Object.entries(fields)) {
    if (
      /источник|source/i.test(k) &&
      typeof v === "string" &&
      v.trim()
    ) {
      return v.trim();
    }
  }

  return null;
}

export function resolveDealSource(deal: {
  title?: string | null;
  customFields?: unknown;
  contact?: {
    company?: string | null;
    customFields?: unknown;
    notes?: { content: string }[];
  } | null;
  whatsappMessages?: { textContent?: string | null }[];
}): string | null {
  const explicitDealSource = readCustomSourceValue(
    deal.customFields as Record<string, unknown> | null | undefined
  );
  if (explicitDealSource) return explicitDealSource;

  const contactSource = readCustomSourceValue(
    deal.contact?.customFields as Record<string, unknown> | null | undefined
  );
  if (contactSource) return contactSource;

  const title = (deal.title || "").trim();
  const company = (deal.contact?.company || "").trim();
  const notesText = (deal.contact?.notes || []).map((n) => n.content).join(" ");
  const messagesText = (deal.whatsappMessages || [])
    .map((m) => m.textContent || "")
    .join(" ");
  const combined = `${title} ${company} ${notesText} ${messagesText}`;

  const hasTargetCue =
    /реклама click-to-whatsapp|таргет|click-to-whatsapp|instagram|fb\.me/i.test(
      combined
    );
  if (hasTargetCue) {
    return TARGET_KZ_REGEX.test(combined) ? "Таргет KZ" : "Таргет Инст";
  }

  const isWhatsappOrCallo =
    /whatsapp|callo|автообзвон|отклик/i.test(`${title} ${company} ${notesText}`) ||
    (deal.whatsappMessages && deal.whatsappMessages.length > 0);
  if (isWhatsappOrCallo) {
    return "Автообзвон";
  }

  return null;
}

const PLACEHOLDER_NAME_PATTERNS = [
  /^не\s*известно$/i,
  /^unknown$/i,
  /^без\s*имени$/i,
  /^клиент\s*whatsapp$/i,
  /^лид\s+(whatsapp|автообзвон)/i,
];

export function getDisplayContactName(
  name?: string | null,
  phone?: string | null
): string | null {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;

  for (const pat of PLACEHOLDER_NAME_PATTERNS) {
    if (pat.test(trimmed)) return null;
  }

  // Не показываем в качестве имени технические числовые ID/номера (например 213434322956432 или +7701...)
  if (/^[\d+\s().\-_@lid:]+$/i.test(trimmed)) {
    return null;
  }

  const normalizedPhone = (phone || "").replace(/\D/g, "");
  const normalizedName = trimmed.replace(/\D/g, "");
  if (
    normalizedPhone.length >= 7 &&
    normalizedName === normalizedPhone
  ) {
    return null;
  }

  return trimmed;
}
