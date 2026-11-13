"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Currency, FieldType, Prisma, Role, StageType } from "@prisma/client";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Требуется авторизация в системе");
  }
  return session.user;
}

// 1. Поиск контакта по телефону (для умной проверки дублей)
export async function searchContactByPhone(phone: string) {
  try {
    await getAuthUser();
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 4) return null;

    const contact = await prisma.contact.findFirst({
      where: {
        phone: {
          contains: cleanPhone,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        company: true,
      },
    });

    return contact;
  } catch {
    return null;
  }
}

// 2. Создание сделки с умной проверкой/привязкой контакта
export async function createDeal(data: {
  title: string;
  pipelineId: string;
  stageId: string;
  totalBudget: number;
  currency: Currency;
  assignedToId?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactCompany?: string;
  source?: string;
}) {
  try {
    const user = await getAuthUser();

    if (!data.title?.trim() || !data.pipelineId || !data.stageId) {
      return { success: false, error: "Заполните название сделки, воронку и этап" };
    }

    let finalContactId = data.contactId;

    // Если контакт не выбран напрямую, проверяем по телефону или создаем новый
    if (!finalContactId) {
      if (!data.contactName?.trim() || !data.contactPhone?.trim()) {
        return { success: false, error: "Укажите имя и телефон клиента" };
      }

      const cleanPhone = data.contactPhone.trim();
      const existingContact = await prisma.contact.findFirst({
        where: { phone: cleanPhone },
      });

      if (existingContact) {
        finalContactId = existingContact.id;
      } else {
        // Создаем новый контакт
        const newContact = await prisma.contact.create({
          data: {
            name: data.contactName.trim(),
            phone: cleanPhone,
            company: data.contactCompany?.trim() || null,
            assignedToId: data.assignedToId || user.id,
          },
        });
        finalContactId = newContact.id;
      }
    }

    // Получаем текущий курс валют
    const currencySetting = await prisma.currencySetting.findFirst();
    let exchangeRate = 1.0;
    if (data.currency === Currency.USD) {
      exchangeRate = currencySetting?.rateUsd || 495.0;
    } else if (data.currency === Currency.RUB) {
      exchangeRate = currencySetting?.rateRub || 5.2;
    }

    const deal = await prisma.deal.create({
      data: {
        title: data.title.trim(),
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        contactId: finalContactId,
        totalBudget: Number(data.totalBudget) || 0,
        currency: data.currency,
        exchangeRateAtCreation: exchangeRate,
        assignedToId: data.assignedToId || user.id,
        ...(data.source?.trim()
          ? { customFields: { source: data.source.trim() } }
          : {}),
      },
    });

    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { success: true, dealId: deal.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка создания сделки";
    return { success: false, error: message };
  }
}

function resolveClosedAtByStageType(
  stageType: StageType,
  currentClosedAt: Date | null
): Date | null {
  if (stageType === StageType.WON || stageType === StageType.LOST) {
    return currentClosedAt || new Date();
  }
  return null;
}

// 3. Перемещение сделки между этапами (Drag and Drop)
export async function moveDealStage(dealId: string, newStageId: string) {
  try {
    const user = await getAuthUser();

    const [deal, targetStage] = await Promise.all([
      prisma.deal.findUnique({
        where: { id: dealId },
      }),
      prisma.stage.findUnique({
        where: { id: newStageId },
      }),
    ]);

    if (!deal || !targetStage) {
      return { success: false, error: "Сделка или этап не найдены" };
    }

    // Менеджер может перемещать только свои сделки
    if (user.role === Role.MANAGER && deal.assignedToId !== user.id) {
      return { success: false, error: "Вы можете перемещать только свои сделки" };
    }

    const closedAt = resolveClosedAtByStageType(targetStage.type, deal.closedAt);

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        pipelineId: targetStage.pipelineId,
        stageId: newStageId,
        closedAt,
      },
    });

    revalidatePath("/deals");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка перемещения сделки";
    return { success: false, error: message };
  }
}

// 3.1 Перемещение сделки в другую воронку (напрямую с карточки или из drawer)
export async function moveDealPipeline(
  dealId: string,
  targetPipelineId: string,
  targetStageId?: string
) {
  try {
    const user = await getAuthUser();

    const [deal, targetPipeline] = await Promise.all([
      prisma.deal.findUnique({
        where: { id: dealId },
        include: { pipeline: { select: { name: true } } },
      }),
      prisma.pipeline.findUnique({
        where: { id: targetPipelineId },
        include: {
          stages: {
            orderBy: { order: "asc" },
          },
        },
      }),
    ]);

    if (!deal || !targetPipeline) {
      return { success: false, error: "Сделка или целевая воронка не найдены" };
    }

    if (user.role === Role.MANAGER && deal.assignedToId !== user.id) {
      return { success: false, error: "Вы можете перемещать только свои сделки" };
    }

    if (targetPipeline.stages.length === 0) {
      return { success: false, error: "В выбранной воронке нет этапов" };
    }

    const chosenStage =
      (targetStageId && targetPipeline.stages.find((s) => s.id === targetStageId)) ||
      targetPipeline.stages.find((s) => s.type === StageType.OPEN) ||
      targetPipeline.stages[0];

    const closedAt = resolveClosedAtByStageType(chosenStage.type, deal.closedAt);

    await prisma.deal.update({
      where: { id: dealId },
      data: {
        pipelineId: targetPipeline.id,
        stageId: chosenStage.id,
        closedAt,
      },
    });

    if (deal.contactId && deal.pipelineId !== targetPipeline.id) {
      await prisma.contactNote.create({
        data: {
          contactId: deal.contactId,
          authorId: user.id,
          content: `Сделка «${deal.title}» перемещена из воронки «${deal.pipeline.name}» в воронку «${targetPipeline.name}» (этап «${chosenStage.name}»).`,
        },
      });
    }

    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/whatsapp");
    revalidatePath("/");
    return {
      success: true,
      pipelineId: targetPipeline.id,
      stageId: chosenStage.id,
      stageName: chosenStage.name,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка перемещения в другую воронку";
    return { success: false, error: message };
  }
}

// 4. Обновление сделки
export async function updateDeal(
  dealId: string,
  data: {
    title?: string;
    totalBudget?: number;
    currency?: Currency;
    pipelineId?: string;
    stageId?: string;
    assignedToId?: string;
    source?: string;
  }
) {
  try {
    const user = await getAuthUser();
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) return { success: false, error: "Сделка не найдена" };

    if (user.role === Role.MANAGER && deal.assignedToId !== user.id) {
      return { success: false, error: "Доступ ограничен: только для ответственного или администратора" };
    }

    const updateData: {
      title?: string;
      totalBudget?: number;
      currency?: Currency;
      pipelineId?: string;
      stageId?: string;
      closedAt?: Date | null;
      assignedToId?: string;
      customFields?: Prisma.InputJsonValue;
    } = {};
    if (data.title) updateData.title = data.title.trim();
    if (data.totalBudget !== undefined) updateData.totalBudget = Number(data.totalBudget);
    if (data.currency) updateData.currency = data.currency;
    if (data.source !== undefined) {
      const prevFields =
        deal.customFields &&
        typeof deal.customFields === "object" &&
        !Array.isArray(deal.customFields)
          ? { ...(deal.customFields as Record<string, unknown>) }
          : {};
      const nextSource = data.source.trim();
      if (nextSource) {
        prevFields.source = nextSource;
      } else {
        delete prevFields.source;
        delete prevFields["Источник"];
        delete prevFields["Источник лида"];
      }
      updateData.customFields = prevFields as Prisma.InputJsonValue;
    }

    const targetPipelineId = data.pipelineId || deal.pipelineId;
    if (data.pipelineId || data.stageId) {
      const targetStages = await prisma.stage.findMany({
        where: { pipelineId: targetPipelineId },
        orderBy: { order: "asc" },
      });
      if (targetStages.length === 0) {
        return { success: false, error: "В выбранной воронке нет этапов" };
      }
      const chosenStage =
        (data.stageId && targetStages.find((s) => s.id === data.stageId)) ||
        targetStages.find((s) => s.type === StageType.OPEN) ||
        targetStages[0];
      updateData.pipelineId = targetPipelineId;
      updateData.stageId = chosenStage.id;
      updateData.closedAt = resolveClosedAtByStageType(chosenStage.type, deal.closedAt);
    }

    if (data.assignedToId && user.role === Role.ADMIN) {
      updateData.assignedToId = data.assignedToId;
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: updateData,
    });

    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/whatsapp");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления сделки";
    return { success: false, error: message };
  }
}

// 5. Удаление сделки (СТРОГО ADMIN)
export async function deleteDeal(dealId: string) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Удаление сделок разрешено только Администратору" };
    }

    await prisma.deal.delete({ where: { id: dealId } });

    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления сделки";
    return { success: false, error: message };
  }
}

// 6. Создание воронки (только ADMIN)
export async function createPipeline(name: string) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Создание воронок доступно только Администратору" };
    }

    if (!name?.trim()) return { success: false, error: "Укажите название воронки" };

    const highestOrderPipeline = await prisma.pipeline.findFirst({
      orderBy: { order: "desc" },
    });
    const nextOrder = (highestOrderPipeline?.order || 0) + 1;

    const pipeline = await prisma.pipeline.create({
      data: {
        name: name.trim(),
        order: nextOrder,
        stages: {
          create: [
            { name: "Новая заявка", color: "#94A3B8", order: 1, type: StageType.OPEN },
            { name: "Квалификация", color: "#38BDF8", order: 2, type: StageType.OPEN },
            { name: "Презентация", color: "#818CF8", order: 3, type: StageType.OPEN },
            { name: "Успешно реализовано", color: "#10B981", order: 4, type: StageType.WON },
            { name: "Закрыто и не реализовано", color: "#EF4444", order: 5, type: StageType.LOST },
          ],
        },
      },
    });

    revalidatePath("/deals");
    revalidatePath("/settings");
    return { success: true, pipelineId: pipeline.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка создания воронки";
    return { success: false, error: message };
  }
}

// 7. Создание этапа воронки (только ADMIN)
export async function createStage(pipelineId: string, data: { name: string; color: string; type?: StageType }) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Редактирование этапов доступно только Администратору" };
    }

    const lastStage = await prisma.stage.findFirst({
      where: { pipelineId },
      orderBy: { order: "desc" },
    });
    const order = (lastStage?.order || 0) + 1;

    await prisma.stage.create({
      data: {
        pipelineId,
        name: data.name.trim(),
        color: data.color || "#3388FF",
        type: data.type || StageType.OPEN,
        order,
      },
    });

    revalidatePath("/deals");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка добавления этапа";
    return { success: false, error: message };
  }
}

// 8. Обновление этапа воронки (только ADMIN)
export async function updateStage(
  stageId: string,
  data: { name?: string; color?: string; type?: StageType }
) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Редактирование этапов доступно только Администратору" };
    }

    await prisma.stage.update({
      where: { id: stageId },
      data,
    });

    revalidatePath("/deals");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления этапа";
    return { success: false, error: message };
  }
}

// 9. Удаление этапа воронки (только ADMIN)
export async function deleteStage(stageId: string) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Удаление этапов доступно только Администратору" };
    }

    const dealsCount = await prisma.deal.count({ where: { stageId } });
    if (dealsCount > 0) {
      return { success: false, error: `В этом этапе находятся сделки (${dealsCount} шт). Сначала переместите их.` };
    }

    await prisma.stage.delete({ where: { id: stageId } });

    revalidatePath("/deals");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления этапа";
    return { success: false, error: message };
  }
}

// 10. Изменение порядка этапов воронки (только ADMIN)
export async function reorderStages(pipelineId: string, orderedStageIds: string[]) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Изменение порядка этапов доступно только Администратору" };
    }

    await prisma.$transaction(
      orderedStageIds.map((stageId, index) =>
        prisma.stage.update({
          where: { id: stageId },
          data: { order: index + 1 },
        })
      )
    );

    revalidatePath("/deals");
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка изменения порядка этапов";
    return { success: false, error: message };
  }
}

// 11. Настройка полей amoCRM для сделок и контактов
const DEFAULT_DEAL_FIELDS = [
  {
    name: "Тип маркетинга",
    fieldType: FieldType.SELECT,
    options: [
      "Контекстная реклама",
      "Таргетированная реклама",
      "Комплексный маркетинг",
      "SEO продвижение",
      "Автообзвон",
      "Разработка сайтов",
    ],
  },
  {
    name: "Дата запуска кампании",
    fieldType: FieldType.DATE,
    options: [],
  },
  {
    name: "Бюджет кампании",
    fieldType: FieldType.NUMBER,
    options: [],
  },
  {
    name: "Тип клиента",
    fieldType: FieldType.SELECT,
    options: ["Новый клиент", "Повторный клиент", "Партнер"],
  },
  {
    name: "Требуется согласование",
    fieldType: FieldType.SELECT,
    options: ["Да", "Нет"],
  },
  {
    name: "Комментарии менеджера",
    fieldType: FieldType.TEXT,
    options: [],
  },
  {
    name: "Источник",
    fieldType: FieldType.SELECT,
    options: [
      "Автообзвон",
      "WhatsApp",
      "Таргет (KZ)",
      "Таргет (Инт)",
      "Рекомендация",
      "Сайт",
      "Не указан",
    ],
  },
];

export async function getDealFieldDefinitionsAction() {
  try {
    let dealFields = await prisma.customFieldDefinition.findMany({
      where: { entityType: "DEAL" },
      orderBy: { createdAt: "asc" },
    });

    if (dealFields.length === 0) {
      for (const df of DEFAULT_DEAL_FIELDS) {
        await prisma.customFieldDefinition.create({
          data: {
            entityType: "DEAL",
            name: df.name,
            fieldType: df.fieldType,
            options: JSON.stringify(df.options),
            isRequired: false,
          },
        });
      }
      dealFields = await prisma.customFieldDefinition.findMany({
        where: { entityType: "DEAL" },
        orderBy: { createdAt: "asc" },
      });
    }

    // Проверяем наличие поля «Должность» у контактов
    const hasPosition = await prisma.customFieldDefinition.findFirst({
      where: { entityType: "CONTACT", name: "Должность" },
    });
    if (!hasPosition) {
      await prisma.customFieldDefinition.create({
        data: {
          entityType: "CONTACT",
          name: "Должность",
          fieldType: FieldType.TEXT,
          options: "[]",
          isRequired: false,
        },
      });
    }

    const contactFields = await prisma.customFieldDefinition.findMany({
      where: { entityType: "CONTACT" },
      orderBy: { createdAt: "asc" },
    });

    const parsedDeal = dealFields.map((f) => {
      let opts: string[] = [];
      try {
        opts = typeof f.options === "string" ? JSON.parse(f.options) : (f.options as string[]) || [];
      } catch {
        opts = [];
      }
      return {
        id: f.id,
        entityType: "DEAL" as const,
        name: f.name,
        fieldType: f.fieldType as "TEXT" | "NUMBER" | "DATE" | "SELECT",
        options: Array.isArray(opts) ? opts : [],
        isRequired: f.isRequired,
      };
    });

    const parsedContact = contactFields.map((f) => {
      let opts: string[] = [];
      try {
        opts = typeof f.options === "string" ? JSON.parse(f.options) : (f.options as string[]) || [];
      } catch {
        opts = [];
      }
      return {
        id: f.id,
        entityType: "CONTACT" as const,
        name: f.name,
        fieldType: f.fieldType as "TEXT" | "NUMBER" | "DATE" | "SELECT",
        options: Array.isArray(opts) ? opts : [],
        isRequired: f.isRequired,
      };
    });

    return {
      success: true,
      dealFields: parsedDeal,
      contactFields: parsedContact,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Ошибка загрузки настроек полей",
      dealFields: [],
      contactFields: [],
    };
  }
}

export async function createDealFieldDefinitionAction(data: {
  entityType?: "DEAL" | "CONTACT";
  name: string;
  fieldType: "TEXT" | "NUMBER" | "DATE" | "SELECT";
  options?: string[];
  isRequired?: boolean;
}) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Доступ запрещен: настраивать поля может только Администратор" };
    }
    if (!data.name?.trim()) {
      return { success: false, error: "Укажите название поля" };
    }

    const field = await prisma.customFieldDefinition.create({
      data: {
        entityType: data.entityType || "DEAL",
        name: data.name.trim(),
        fieldType: data.fieldType,
        options: data.options ? JSON.stringify(data.options) : "[]",
        isRequired: !!data.isRequired,
      },
    });

    revalidatePath("/deals");
    revalidatePath("/contacts");
    return { success: true, fieldId: field.id };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка создания поля" };
  }
}

export async function deleteDealFieldDefinitionAction(fieldId: string) {
  try {
    const user = await getAuthUser();
    if (user.role !== Role.ADMIN) {
      return { success: false, error: "Доступ запрещен: удалять поля может только Администратор" };
    }

    await prisma.customFieldDefinition.delete({
      where: { id: fieldId },
    });

    revalidatePath("/deals");
    revalidatePath("/contacts");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка удаления поля" };
  }
}

// 12. Полное обновление сделки и контакта с фиксацией событий в amoCRM ленту
export async function updateDealFullAction(
  dealId: string,
  data: {
    title?: string;
    totalBudget?: number;
    currency?: Currency;
    pipelineId?: string;
    stageId?: string;
    assignedToId?: string;
    source?: string;
    customFields?: Record<string, unknown>;
    contact?: {
      id: string;
      name?: string;
      company?: string | null;
      phone?: string;
      email?: string | null;
      customFields?: Record<string, unknown>;
    };
  }
) {
  try {
    const user = await getAuthUser();
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { contact: true, stage: true, pipeline: true },
    });
    if (!deal) return { success: false, error: "Сделка не найдена" };

    if (user.role === Role.MANAGER && deal.assignedToId !== user.id) {
      return { success: false, error: "Доступ ограничен: только для ответственного или администратора" };
    }

    const dealUpdate: Record<string, unknown> = {};
    const auditLogs: string[] = [];

    if (data.title && data.title.trim() !== deal.title) {
      dealUpdate.title = data.title.trim();
      auditLogs.push(`Для поля «Название» установлено значение «${data.title.trim()}»`);
    }

    if (data.totalBudget !== undefined && Number(data.totalBudget) !== deal.totalBudget) {
      dealUpdate.totalBudget = Number(data.totalBudget);
      auditLogs.push(`Для поля «Бюджет» установлено значение «${data.totalBudget}»`);
    }

    if (data.currency && data.currency !== deal.currency) {
      dealUpdate.currency = data.currency;
    }

    if (data.assignedToId && user.role === Role.ADMIN && data.assignedToId !== deal.assignedToId) {
      dealUpdate.assignedToId = data.assignedToId;
      const nextUser = await prisma.user.findUnique({ where: { id: data.assignedToId } });
      if (nextUser) {
        auditLogs.push(`Ответственным назначен «${nextUser.name}»`);
      }
    }

    // Merge deal custom fields
    const prevCustom =
      deal.customFields && typeof deal.customFields === "object" && !Array.isArray(deal.customFields)
        ? { ...(deal.customFields as Record<string, unknown>) }
        : {};

    if (data.source !== undefined) {
      prevCustom.source = data.source.trim();
    }

    if (data.customFields) {
      for (const [k, v] of Object.entries(data.customFields)) {
        const oldVal = prevCustom[k];
        if (oldVal !== v) {
          const displayVal = v === true ? "Да" : v === false ? "Нет" : String(v || "—");
          auditLogs.push(`Для поля «${k}» установлено значение «${displayVal}»`);
        }
        prevCustom[k] = v;
      }
    }
    dealUpdate.customFields = prevCustom;

    // Pipeline / stage move
    const targetPipelineId = data.pipelineId || deal.pipelineId;
    if (data.pipelineId || data.stageId) {
      const targetStages = await prisma.stage.findMany({
        where: { pipelineId: targetPipelineId },
        orderBy: { order: "asc" },
      });
      if (targetStages.length > 0) {
        const chosenStage =
          (data.stageId && targetStages.find((s) => s.id === data.stageId)) ||
          targetStages.find((s) => s.type === StageType.OPEN) ||
          targetStages[0];

        if (chosenStage.id !== deal.stageId || targetPipelineId !== deal.pipelineId) {
          dealUpdate.pipelineId = targetPipelineId;
          dealUpdate.stageId = chosenStage.id;
          dealUpdate.closedAt = resolveClosedAtByStageType(chosenStage.type, deal.closedAt);
          auditLogs.push(`Сделка перемещена на этап «${chosenStage.name}»`);
        }
      }
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: dealUpdate as Prisma.DealUpdateInput,
    });

    // Обновление контакта при необходимости
    if (data.contact && deal.contactId) {
      const contactUpdate: Record<string, unknown> = {};
      if (data.contact.name && data.contact.name.trim() !== deal.contact.name) {
        contactUpdate.name = data.contact.name.trim();
        auditLogs.push(`Имя контакта изменено на «${data.contact.name.trim()}»`);
      }
      if (data.contact.phone && data.contact.phone.trim() !== deal.contact.phone) {
        contactUpdate.phone = data.contact.phone.trim();
        auditLogs.push(`Телефон контакта изменен на «${data.contact.phone.trim()}»`);
      }
      if (data.contact.company !== undefined && data.contact.company !== deal.contact.company) {
        contactUpdate.company = data.contact.company ? data.contact.company.trim() : null;
        auditLogs.push(`Компания изменена на «${contactUpdate.company || "—"}»`);
      }
      if (data.contact.email !== undefined && data.contact.email !== deal.contact.email) {
        contactUpdate.email = data.contact.email ? data.contact.email.trim() : null;
        auditLogs.push(`Email изменен на «${contactUpdate.email || "—"}»`);
      }
      if (data.contact.customFields) {
        const prevContactCustom =
          deal.contact.customFields && typeof deal.contact.customFields === "object" && !Array.isArray(deal.contact.customFields)
            ? { ...(deal.contact.customFields as Record<string, unknown>) }
            : {};
        for (const [k, v] of Object.entries(data.contact.customFields)) {
          if (prevContactCustom[k] !== v) {
            auditLogs.push(`Для контакта поле «${k}»: «${v || "—"}»`);
          }
          prevContactCustom[k] = v;
        }
        contactUpdate.customFields = prevContactCustom;
      }

      if (Object.keys(contactUpdate).length > 0) {
        await prisma.contact.update({
          where: { id: deal.contactId },
          data: contactUpdate as Prisma.ContactUpdateInput,
        });
      }
    }

    // Сохраняем аудит-логи в ContactNote для формирования ленты событий amoCRM
    if (auditLogs.length > 0 && deal.contactId) {
      await prisma.contactNote.create({
        data: {
          contactId: deal.contactId,
          authorId: user.id,
          content: `${user.name}: ${auditLogs.join(". ")}`,
        },
      });
    }

    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/whatsapp");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка обновления сделки";
    return { success: false, error: message };
  }
}

// 13. Добавление примечания к сделке (в ленту событий контакта)
export async function addDealNoteAction(contactId: string, content: string) {
  try {
    const user = await getAuthUser();
    if (!content?.trim()) {
      return { success: false, error: "Введите текст примечания" };
    }
    const note = await prisma.contactNote.create({
      data: {
        contactId,
        authorId: user.id,
        content: content.trim(),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    revalidatePath("/deals");
    revalidatePath("/contacts");
    return {
      success: true,
      note: {
        id: note.id,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        author: { id: note.author.id, name: note.author.name },
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка добавления примечания" };
  }
}
