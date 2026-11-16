import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: "KZT" | "USD" | "RUB" = "KZT"): string {
  const symbols: Record<string, string> = {
    KZT: "₸",
    USD: "$",
    RUB: "₽",
  };

  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);

  return `${formatted} ${symbols[currency] || currency}`;
}

export function formatDate(date: Date | string | number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

/**
 * Корректно парсит дату со стороны клиента с учетом часового пояса Алматы/Казахстан (UTC+5).
 * Если клиент прислал ISO-строку с часовым поясом (Z или +05:00), парсит стандартно.
 * Если пришла строка без таймзоны из <input type="datetime-local"> ("2026-11-16T15:30"),
 * принудительно фиксирует часовой пояс +05:00, чтобы серверный UTC не смещал время на 5 часов!
 */
export function parseClientDueDate(input: Date | string): Date {
  if (input instanceof Date) return input;
  const str = String(input || "").trim();
  if (!str) return new Date();

  // Уже содержит Z или явное смещение (+05:00, -03:00 и т.д.)
  if (/Z$|[+-]\d{2}:?\d{2}$/i.test(str)) {
    return new Date(str);
  }

  // Локальный формат datetime-local: "YYYY-MM-DDTHH:mm" или "YYYY-MM-DD HH:mm"
  const normalized = str.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(normalized)) {
    return new Date(`${normalized}+05:00`);
  }

  return new Date(str);
}
