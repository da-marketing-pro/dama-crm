export const DEFAULT_IGNORED_LABEL_NAMES = [
  "Клиент, в проекте",
  "Не писать, не звонить",
] as const;

export type LeadFilterMode = "ALL_EXCEPT_IGNORED" | "ONLY_ADS_OR_KEYWORDS";

export interface NormalizedPhoneKey {
  phoneKey: string;
  rawDisplay: string;
  isLid: boolean;
  last10: string;
}

/**
 * Приводит любой формат номера/JID (+7 777..., 8777..., 7777...@s.whatsapp.net, 123...@lid)
 * к единому каноническому ключу phoneKey для точного сравнения в стоп-листе.
 */
export function extractPhoneKeyAndRaw(
  rawInput: string | null | undefined,
  fallbackRawJid?: string | null
): NormalizedPhoneKey | null {
  const input = (rawInput || "").trim();
  const fallback = (fallbackRawJid || "").trim();
  if (!input && !fallback) return null;

  const isExplicitLid =
    input.toLowerCase().endsWith("@lid") ||
    input.toLowerCase().startsWith("lid:") ||
    (!input && fallback.toLowerCase().endsWith("@lid"));

  if (isExplicitLid) {
    const src = input || fallback;
    const base = src
      .replace(/^lid:/i, "")
      .split("@")[0]
      .split(":")[0]
      .trim()
      .toLowerCase();
    if (!base) return null;
    return {
      phoneKey: `lid:${base}`,
      rawDisplay: `${base}@lid`,
      isLid: true,
      last10: "",
    };
  }

  let digits = input.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!digits && fallback && !fallback.toLowerCase().endsWith("@lid")) {
    digits = fallback.split("@")[0].split(":")[0].replace(/\D/g, "");
  }

  if (!digits || digits.length < 5) {
    if (fallback.toLowerCase().endsWith("@lid")) {
      const base = fallback.split("@")[0].split(":")[0].trim().toLowerCase();
      if (base) {
        return {
          phoneKey: `lid:${base}`,
          rawDisplay: `${base}@lid`,
          isLid: true,
          last10: "",
        };
      }
    }
    return null;
  }

  // Нормализуем 11-значные номера СНГ (8777... -> 7777...)
  const canonicalDigits =
    digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;

  return {
    phoneKey: canonicalDigits,
    rawDisplay: `+${canonicalDigits}`,
    isLid: false,
    last10: canonicalDigits.length >= 10 ? canonicalDigits.slice(-10) : "",
  };
}

/**
 * Разбирает многострочный или разделенный запятыми список номеров в массив уникальных записей.
 */
export function parseBulkPhonesInput(rawText: string): NormalizedPhoneKey[] {
  const tokens = rawText
    .split(/[\n\r,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const result: NormalizedPhoneKey[] = [];

  for (const token of tokens) {
    const parsed = extractPhoneKeyAndRaw(token);
    if (parsed && !seen.has(parsed.phoneKey)) {
      seen.add(parsed.phoneKey);
      result.push(parsed);
    }
  }
  return result;
}

export function normalizeJsonStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

/**
 * Если ignoredLabelNames ещё ни разу не сохранялся (null/undefined),
 * подставляем рекомендованные ярлыки из WhatsApp Business по умолчанию.
 */
export function resolveEffectiveIgnoredLabels(val: unknown): string[] {
  if (val === null || val === undefined) {
    return [...DEFAULT_IGNORED_LABEL_NAMES];
  }
  return normalizeJsonStringArray(val);
}

export function normalizeLeadFilterMode(val: unknown): LeadFilterMode {
  return val === "ONLY_ADS_OR_KEYWORDS" ? "ONLY_ADS_OR_KEYWORDS" : "ALL_EXCEPT_IGNORED";
}

export function matchesLeadKeywords(
  textContent: string | null | undefined,
  keywords: string[]
): boolean {
  if (!textContent || keywords.length === 0) return false;
  const hay = textContent.toLowerCase();
  return keywords.some((kw) => {
    const needle = kw.trim().toLowerCase();
    return needle.length > 0 && hay.includes(needle);
  });
}
