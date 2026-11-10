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
