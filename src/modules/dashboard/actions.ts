"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ChartType, StageType, Currency } from "@prisma/client";
import {
  PeriodOption,
  MetricType,
  KpiMetrics,
  PipelineFilterOption,
  DashboardWidgetData,
  CreateWidgetInput,
  UpdateWidgetInput,
} from "./types";
import { convertCurrency } from "@/lib/currency";

async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Требуется авторизация в системе");
  }
  return session.user;
}

// 1. Главное получение аналитических данных и виджетов для дашборда
export async function getDashboardData(params?: {
  period?: PeriodOption;
  dateFrom?: string;
  dateTo?: string;
  pipelineId?: string;
}) {
  const user = await getAuthUser();
  const isAdmin = user.role === "ADMIN";

  const period: PeriodOption = params?.period || "30d";
  const pipelineId = params?.pipelineId || undefined;

  // 1. Вычисляем временные границы периода
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date(now);

  if (period === "7d") {
    startDate.setDate(now.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "30d") {
    startDate.setDate(now.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "custom") {
    if (params?.dateFrom) {
      startDate = new Date(params.dateFrom);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setDate(now.getDate() - 30);
    }
    if (params?.dateTo) {
      endDate = new Date(params.dateTo);
      endDate.setHours(23, 59, 59, 999);
    }
  }

  // RBAC фильтры
  const dealOwnerFilter = isAdmin ? {} : { assignedToId: user.id };
  const contactOwnerFilter = isAdmin ? {} : { assignedToId: user.id };

  // 2. Параллельный запрос данных из БД
  const [currencySetting, pipelines, users, widgetsFromDb] = await Promise.all([
    prisma.currencySetting.findFirst(),
    prisma.pipeline.findMany({
      orderBy: { order: "asc" },
      include: {
        stages: {
          orderBy: { order: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
    }),
    prisma.dashboardWidget.findMany({
      where: { userId: user.id },
      orderBy: { order: "asc" },
    }),
  ]);

  // Воронки для фильтра
  const pipelinesFilterOptions: PipelineFilterOption[] = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    stages: p.stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      type: s.type,
    })),
  }));

  // Если у пользователя еще нет сохраненных виджетов — создаем базовый набор виджетов
  let userWidgets = widgetsFromDb;
  if (userWidgets.length === 0) {
    const defaultTemplates = [
      {
        title: "Динамика выручки (KZT)",
        metricType: "REVENUE",
        chartType: ChartType.LINE,
        order: 1,
        config: {},
      },
      {
        title: "Сделки по этапам воронки",
        metricType: "DEALS_BY_STAGE",
        chartType: ChartType.BAR,
        order: 2,
        config: {},
      },
      {
        title: "Новые входящие лиды",
        metricType: "LEADS",
        chartType: ChartType.BAR,
        order: 3,
        config: {},
      },
      {
        title: "Распределение сделок по менеджерам",
        metricType: "DEALS_BY_MANAGER",
        chartType: ChartType.PIE,
        order: 4,
        config: {},
      },
    ];

    for (const t of defaultTemplates) {
      const created = await prisma.dashboardWidget.create({
        data: {
          userId: user.id,
          title: t.title,
          metricType: t.metricType,
          chartType: t.chartType,
          order: t.order,
          config: t.config,
        },
      });
      userWidgets.push(created);
    }
  }

  // 3. Запрос сделок и платежей за период для вычисления KPI и графиков
  const [dealsInPeriod, allActiveDeals, paymentsInPeriod] = await Promise.all([
    // Все сделки, созданные в период (или обновленные)
    prisma.deal.findMany({
      where: {
        ...dealOwnerFilter,
        ...(pipelineId ? { pipelineId } : {}),
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        stage: true,
        pipeline: true,
        contact: true,
        payments: true,
        assignedTo: true,
      },
    }),
    // Все сделки в системе для актуального статуса воронки
    prisma.deal.findMany({
      where: {
        ...dealOwnerFilter,
        ...(pipelineId ? { pipelineId } : {}),
      },
      include: {
        stage: true,
        pipeline: true,
        contact: true,
        payments: true,
        assignedTo: true,
      },
    }),
    // Все оплаты за период
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: startDate, lte: endDate },
        deal: {
          ...dealOwnerFilter,
          ...(pipelineId ? { pipelineId } : {}),
        },
      },
      include: {
        deal: {
          include: {
            assignedTo: true,
            stage: true,
          },
        },
      },
    }),
  ]);

  // 4. Расчет 5 обязательных KPI в текущей базовой валюте системы (KZT, USD или RUB)
  const baseCurrency: Currency = currencySetting?.baseCurrency || Currency.USD;
  const rates = {
    rateUsd: currencySetting?.rateUsd || 495.0,
    rateRub: currencySetting?.rateRub || 5.2,
  };

  // 1) Общий доход за период (динамическая конвертация каждой оплаты в базовую валюту)
  const totalRevenue = paymentsInPeriod.reduce((sum, p) => {
    return sum + convertCurrency(Number(p.amount), p.currency, baseCurrency, rates);
  }, 0);

  // 2) Количество новых лидов за период
  const newLeadsCount = dealsInPeriod.length;

  // 3) Количество лидов в работе (открытые сделки на нефинальных этапах stage.type === OPEN)
  const leadsInWorkCount = allActiveDeals.filter((d) => d.stage.type === StageType.OPEN).length;

  // 4) Количество успешно завершенных сделок (WON) за период
  const wonDealsCount = allActiveDeals.filter(
    (d) =>
      d.stage.type === StageType.WON &&
      ((d.closedAt && d.closedAt >= startDate && d.closedAt <= endDate) ||
        (d.updatedAt >= startDate && d.updatedAt <= endDate))
  ).length;

  // 5) Количество клиентов в проектах (уникальные контакты с активными сделками в работе)
  const activeContactsSet = new Set(
    allActiveDeals
      .filter((d) => d.stage.type === StageType.OPEN && d.contactId)
      .map((d) => d.contactId)
  );
  const clientsInProjectsCount = activeContactsSet.size;

  const kpis: KpiMetrics = {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    baseCurrency,
    newLeadsCount,
    leadsInWorkCount,
    wonDealsCount,
    clientsInProjectsCount,
  };

  // 5. Построение непрерывной временной шкалы по дням для графиков
  const daysMap = new Map<string, { date: string; formattedDate: string; revenue: number; leads: number }>();
  const curDay = new Date(startDate);
  while (curDay <= endDate) {
    const ymd = curDay.toISOString().split("T")[0];
    const formattedDate = curDay.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    daysMap.set(ymd, { date: ymd, formattedDate, revenue: 0, leads: 0 });
    curDay.setDate(curDay.getDate() + 1);
  }

  // Наполняем выручкой в базовой валюте
  for (const p of paymentsInPeriod) {
    const ymd = p.paymentDate.toISOString().split("T")[0];
    if (daysMap.has(ymd)) {
      const converted = convertCurrency(Number(p.amount), p.currency, baseCurrency, rates);
      daysMap.get(ymd)!.revenue += converted;
    }
  }

  // Наполняем лидами
  for (const d of dealsInPeriod) {
    const ymd = d.createdAt.toISOString().split("T")[0];
    if (daysMap.has(ymd)) {
      daysMap.get(ymd)!.leads += 1;
    }
  }

  const timelineData = Array.from(daysMap.values());

  // 6. Подготовка данных для каждого виджета
  const widgetsData: DashboardWidgetData[] = userWidgets.map((w) => {
    const widgetConfig = (w.config as any) || {};
    const wPipelineId = widgetConfig.pipelineId || pipelineId;

    let computedData: any[] = [];
    let totalValue: number | undefined = undefined;
    let secondaryValue: string | undefined = undefined;

    // Сделки, относящиеся к воронке этого виджета
    const targetDeals = wPipelineId
      ? allActiveDeals.filter((d) => d.pipelineId === wPipelineId)
      : allActiveDeals;

    const targetDealsInPeriod = wPipelineId
      ? dealsInPeriod.filter((d) => d.pipelineId === wPipelineId)
      : dealsInPeriod;

    const targetPayments = wPipelineId
      ? paymentsInPeriod.filter((p) => p.deal.pipelineId === wPipelineId)
      : paymentsInPeriod;

    switch (w.metricType as MetricType) {
      case "REVENUE": {
        totalValue = targetPayments.reduce((sum, p) => {
          return sum + convertCurrency(Number(p.amount), p.currency, baseCurrency, rates);
        }, 0);
        computedData = timelineData.map((d) => ({
          date: d.formattedDate,
          fullDate: d.date,
          Выручка: Math.round(d.revenue * 100) / 100,
          value: Math.round(d.revenue * 100) / 100,
        }));
        secondaryValue = `${targetPayments.length} траншей (${baseCurrency})`;
        break;
      }

      case "LEADS": {
        totalValue = targetDealsInPeriod.length;
        computedData = timelineData.map((d) => ({
          date: d.formattedDate,
          fullDate: d.date,
          Лиды: d.leads,
          value: d.leads,
        }));
        secondaryValue = "новых обращений";
        break;
      }

      case "DEALS_BY_STAGE": {
        // Находим этапы целевой воронки
        const relevantPipeline = pipelines.find((p) => (wPipelineId ? p.id === wPipelineId : p.isDefault)) || pipelines[0];
        const stages = relevantPipeline ? relevantPipeline.stages : [];

        computedData = stages.map((st) => {
          const count = targetDeals.filter((d) => d.stageId === st.id).length;
          const stageBudgetInBase = targetDeals
            .filter((d) => d.stageId === st.id)
            .reduce((sum, d) => sum + convertCurrency(Number(d.totalBudget), d.currency, baseCurrency, rates), 0);

          return {
            name: st.name,
            Сделок: count,
            value: count,
            Бюджет: Math.round(stageBudgetInBase * 100) / 100,
            color: st.color,
            type: st.type,
          };
        });

        totalValue = targetDeals.length;
        secondaryValue = `в воронке «${relevantPipeline?.name || "Основная"}»`;
        break;
      }

      case "DEALS_BY_MANAGER": {
        // Группировка по менеджерам
        const managerMap = new Map<string, { name: string; count: number; revenue: number }>();

        for (const u of users) {
          managerMap.set(u.id, { name: u.name, count: 0, revenue: 0 });
        }

        for (const d of targetDeals) {
          const mgrId = d.assignedToId || "unassigned";
          if (managerMap.has(mgrId)) {
            managerMap.get(mgrId)!.count += 1;
          }
        }

        for (const p of targetPayments) {
          const mgrId = p.deal.assignedToId || "unassigned";
          if (managerMap.has(mgrId)) {
            managerMap.get(mgrId)!.revenue += convertCurrency(Number(p.amount), p.currency, baseCurrency, rates);
          }
        }

        computedData = Array.from(managerMap.values())
          .filter((m) => m.count > 0 || m.revenue > 0)
          .map((m) => ({
            name: m.name,
            Сделок: m.count,
            Выручка: Math.round(m.revenue * 100) / 100,
            value: m.count,
          }));

        totalValue = targetDeals.length;
        secondaryValue = `${computedData.length} активных сотрудников`;
        break;
      }

      default: {
        computedData = [];
      }
    }

    const titleWithBaseCurrency = w.title.includes("(") && (w.title.includes("KZT") || w.title.includes("USD") || w.title.includes("RUB"))
      ? w.title.replace(/\((KZT|USD|RUB)\)/g, `(${baseCurrency})`)
      : w.metricType === "REVENUE" && !w.title.includes(`(${baseCurrency})`)
      ? `${w.title} (${baseCurrency})`
      : w.title;

    return {
      id: w.id,
      userId: w.userId,
      title: titleWithBaseCurrency,
      metricType: w.metricType as MetricType,
      chartType: w.chartType,
      config: widgetConfig,
      order: w.order,
      data: computedData,
      totalValue: totalValue !== undefined ? Math.round(totalValue * 100) / 100 : undefined,
      secondaryValue,
      baseCurrency,
    };
  });

  return {
    kpis,
    widgets: widgetsData,
    pipelines: pipelinesFilterOptions,
    period,
    pipelineId,
    baseCurrency,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

// 2. Создание нового виджета
export async function createDashboardWidget(input: CreateWidgetInput) {
  try {
    const user = await getAuthUser();

    const maxOrderWidget = await prisma.dashboardWidget.findFirst({
      where: { userId: user.id },
      orderBy: { order: "desc" },
    });

    const newOrder = (maxOrderWidget?.order ?? 0) + 1;

    const widget = await prisma.dashboardWidget.create({
      data: {
        userId: user.id,
        title: input.title.trim() || "Новый виджет",
        metricType: input.metricType,
        chartType: input.chartType,
        order: input.order ?? newOrder,
        config: {
          pipelineId: input.pipelineId || null,
        },
      },
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    return { success: true, widget };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка создания виджета";
    return { success: false, error: msg };
  }
}

// 3. Редактирование виджета
export async function updateDashboardWidget(input: UpdateWidgetInput) {
  try {
    const user = await getAuthUser();

    const existing = await prisma.dashboardWidget.findFirst({
      where: { id: input.id, userId: user.id },
    });

    if (!existing) {
      return { success: false, error: "Виджет не найден" };
    }

    const currentConfig = (existing.config as any) || {};

    const updated = await prisma.dashboardWidget.update({
      where: { id: input.id },
      data: {
        ...(input.title ? { title: input.title.trim() } : {}),
        ...(input.metricType ? { metricType: input.metricType } : {}),
        ...(input.chartType ? { chartType: input.chartType } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        config: {
          ...currentConfig,
          ...(input.pipelineId !== undefined ? { pipelineId: input.pipelineId } : {}),
        },
      },
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    return { success: true, widget: updated };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка обновления виджета";
    return { success: false, error: msg };
  }
}

// 4. Удаление виджета
export async function deleteDashboardWidget(widgetId: string) {
  try {
    const user = await getAuthUser();

    await prisma.dashboardWidget.deleteMany({
      where: {
        id: widgetId,
        userId: user.id,
      },
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка удаления виджета";
    return { success: false, error: msg };
  }
}

// 5. Сброс к виджетам по умолчанию
export async function resetDefaultWidgets() {
  try {
    const user = await getAuthUser();

    await prisma.dashboardWidget.deleteMany({
      where: { userId: user.id },
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка сброса виджетов";
    return { success: false, error: msg };
  }
}
