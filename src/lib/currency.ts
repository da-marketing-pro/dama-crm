import { Currency } from "@prisma/client";

export function convertCurrency(
  amount: number,
  from: Currency | string,
  to: Currency | string,
  rates: { rateUsd?: number | null; rateRub?: number | null }
): number {
  if (from === to) return amount;
  const usdRate = rates.rateUsd && rates.rateUsd > 0 ? rates.rateUsd : 495.0;
  const rubRate = rates.rateRub && rates.rateRub > 0 ? rates.rateRub : 5.2;

  // 1. Конвертация исходной валюты в KZT (опорная валюта курсов)
  let kztAmount = amount;
  if (from === "USD") {
    kztAmount = amount * usdRate;
  } else if (from === "RUB") {
    kztAmount = amount * rubRate;
  } else {
    kztAmount = amount;
  }

  // 2. Конвертация из KZT в целевую валюту
  if (to === "USD") {
    return kztAmount / usdRate;
  } else if (to === "RUB") {
    return kztAmount / rubRate;
  } else {
    return kztAmount; // KZT
  }
}
