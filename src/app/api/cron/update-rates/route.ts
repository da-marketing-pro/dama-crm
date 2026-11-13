import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { calculate60DaysAverageRates } from "@/lib/currencyService";
import { Currency } from "@prisma/client";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const validSecrets = new Set([
    "dama_crm_cron_secret_token_secure_9921",
    process.env.CRON_SECRET,
  ].filter(Boolean));

  // 1. Проверка заголовка Authorization (Bearer <token> или прямой токен)
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (validSecrets.has(token)) {
      return true;
    }
  }

  // 2. Проверка альтернативного заголовка x-cron-secret
  const customHeader = req.headers.get("x-cron-secret");
  if (customHeader && validSecrets.has(customHeader.trim())) {
    return true;
  }

  // 3. Проверка query-параметра ?secret=...
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get("secret");
  if (secretParam && validSecrets.has(secretParam.trim())) {
    return true;
  }

  // 4. Проверка сессии администратора DAMA CRM (для ручного запуска из интерфейса)
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role === "ADMIN") {
      return true;
    }
  } catch (err) {
    // Session check error, fallback to unauthorized
  }

  return false;
}

async function handleUpdateRates(req: NextRequest) {
  // Проверка авторизации
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Неверный или отсутствующий токен авторизации CRON_SECRET",
      },
      { status: 401 }
    );
  }

  try {
    // 1. Получаем средние арифметические курсы за последние 60 дней (2 месяца)
    const avgData = await calculate60DaysAverageRates();

    // 2. Получаем текущие настройки валют
    const existingSetting = await prisma.currencySetting.findFirst();
    const previousRates = existingSetting
      ? { rateUsd: existingSetting.rateUsd, rateRub: existingSetting.rateRub }
      : null;

    let updatedSetting;

    // 3. КРИТИЧЕСКОЕ ПРАВИЛО: Обновляем ТОЛЬКО таблицу CurrencySetting.
    // Сделки (Deal.exchangeRateAtCreation) и Платежи (Payment.amountInBaseCurrency) НЕ МЕНЯЮТСЯ!
    if (existingSetting) {
      updatedSetting = await prisma.currencySetting.update({
        where: { id: existingSetting.id },
        data: {
          rateUsd: avgData.rateUsd,
          rateRub: avgData.rateRub,
          updatedAt: new Date(),
        },
      });
    } else {
      updatedSetting = await prisma.currencySetting.create({
        data: {
          baseCurrency: Currency.USD,
          rateUsd: avgData.rateUsd,
          rateRub: avgData.rateRub,
          rateKzt: 1.0,
        },
      });
    }

    // 4. Сброс кэша страниц для актуализации курсов на UI
    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/dashboard");

    return NextResponse.json({
      success: true,
      message: "Курсы валют успешно обновлены на основе 60-дневного среднего (2 месяца)",
      updatedAt: updatedSetting.updatedAt.toISOString(),
      baseCurrency: updatedSetting.baseCurrency,
      previousRates,
      newRates: {
        rateUsd: updatedSetting.rateUsd,
        rateRub: updatedSetting.rateRub,
      },
      period: {
        start: avgData.periodStart,
        end: avgData.periodEnd,
        daysSampled: avgData.daysSampled,
      },
      source: avgData.source,
    });
  } catch (error: any) {
    console.error("Cron update rates error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Внутренняя ошибка при обновлении курсов валют",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleUpdateRates(req);
}

export async function POST(req: NextRequest) {
  return handleUpdateRates(req);
}
