import { prisma } from "@/lib/prisma";
import { getTelegramAppUrl } from "./telegramAuth";

const MONTH_NAMES_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const WEEKDAY_NAMES_RU = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  replyMarkup?: unknown
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanToken = botToken.trim();
    const cleanChatId = chatId.trim();

    if (!cleanToken || !cleanChatId) {
      return { success: false, error: "Не указан Telegram Bot Token или Chat ID" };
    }

    const payload: Record<string, unknown> = {
      chat_id: cleanChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!data.ok) {
      return {
        success: false,
        error: data.description || "Ошибка отправки сообщения в Telegram API",
      };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Сетевая ошибка Telegram API";
    return { success: false, error: message };
  }
}

export async function setupTelegramBotWebhook(botToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanToken = botToken.trim();
    if (!cleanToken) return { success: false, error: "Токен не указан" };

    const webhookUrl = "https://crm.da-marketing.pro/api/webhooks/telegram";
    const appUrl = "https://crm.da-marketing.pro/api/auth/tg-login?auto=1";

    // 1. Установка вебхука
    await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, drop_pending_updates: false }),
    });

    // 2. Установка постоянной кнопки меню "📱 CRM" (Telegram Web App Mini App)
    await fetch(`https://api.telegram.org/bot${cleanToken}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "📱 CRM",
          web_app: { url: appUrl },
        },
      }),
    });

    // 3. Установка подсказок команд бота
    await fetch(`https://api.telegram.org/bot${cleanToken}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "tasks", description: "Сводка задач на сегодня" },
          { command: "deals", description: "Активные сделки и контакты" },
          { command: "crm", description: "Открыть CRM Mini App" },
        ],
      }),
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Ошибка настройки бота" };
  }
}

export function getLocalTodayInfo(targetDate: Date = new Date()) {
  const utc = targetDate.getTime() + targetDate.getTimezoneOffset() * 60000;
  const tzOffsetHours = 5; // UTC+5 Казахстан
  const localDate = new Date(utc + 3600000 * tzOffsetHours);

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;
  const dayOfWeek = localDate.getDay();

  return { localDate, dateStr, dayOfWeek };
}

export async function sendDailyTasksDigest(options: { force?: boolean } = {}): Promise<{
  success: boolean;
  skipped?: string;
  error?: string;
  count?: number;
}> {
  try {
    const setting = await prisma.telegramSetting.findFirst();

    if (!setting || !setting.enabled || !setting.botToken || !setting.chatId) {
      return { success: false, skipped: "DISABLED_OR_NOT_CONFIGURED" };
    }

    const { localDate, dateStr, dayOfWeek } = getLocalTodayInfo();

    // Воскресенье (0) — день отдыха, сводка не отправляется (если не форсировано)
    if (dayOfWeek === 0 && !options.force) {
      return { success: true, skipped: "SUNDAY" };
    }

    // Защита от дубликатов: проверяем, отправлялась ли уже сводка сегодня
    if (setting.lastSentDate === dateStr && !options.force) {
      return { success: true, skipped: "ALREADY_SENT_TODAY" };
    }

    // Вычисляем границы сегодняшнего дня в UTC+5
    const startOfDay = new Date(localDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(localDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Запрашиваем активные невыполненные задачи на сегодня (включая просроченные)
    const tasks = await prisma.task.findMany({
      where: {
        isCompleted: false,
        dueDate: {
          lte: endOfDay,
        },
      },
      include: {
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, name: true, company: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    let messageText = "";
    let replyMarkup: unknown = undefined;

    // По требованию: "Если задач нет, то в сообщение просто приходит 'нет задач на сегодня'"
    if (tasks.length === 0) {
      messageText = "нет задач на сегодня";
      // Даже если нет задач, добавим кнопку для открытия CRM Mini App
      const crmUrl = await getTelegramAppUrl({ redirect: "/tasks" });
      replyMarkup = {
        inline_keyboard: [
          [{ text: "📱 Открыть CRM (Mini App)", web_app: { url: crmUrl } }],
        ],
      };
    } else {
      const dayName = WEEKDAY_NAMES_RU[dayOfWeek];
      const monthName = MONTH_NAMES_RU[localDate.getMonth()];
      const dayNum = localDate.getDate();

      const inlineKeyboard: Array<Array<{ text: string; web_app: { url: string } }>> = [];

      const taskLines = await Promise.all(
        tasks.map(async (t, idx) => {
          const taskDate = new Date(t.dueDate);
          const hours = String(taskDate.getHours()).padStart(2, "0");
          const minutes = String(taskDate.getMinutes()).padStart(2, "0");
          const hasTime = !(hours === "00" && minutes === "00");
          const timeStr = hasTime ? `${hours}:${minutes}` : "В течение дня";

          let typeIcon = "📌";
          let typeName = "Задача";
          switch (t.taskType) {
            case "CALL":
              typeIcon = "📞";
              typeName = "Связаться / Созвон";
              break;
            case "MEETING":
              typeIcon = "🤝";
              typeName = "Встреча / Разбор";
              break;
            case "OFFER":
              typeIcon = "📄";
              typeName = "Отправить КП";
              break;
            case "PAYMENT":
              typeIcon = "💳";
              typeName = "Контроль оплаты";
              break;
            case "MESSAGE":
              typeIcon = "💬";
              typeName = "WhatsApp";
              break;
          }

          const contactPart = t.contact?.name
            ? `\n   👤 <b>Клиент:</b> ${t.contact.name}${t.contact.company ? ` (${t.contact.company})` : ""}${t.contact.phone ? ` • <code>${t.contact.phone}</code>` : ""}`
            : "";

          const dealPart = t.deal?.title
            ? `\n   💼 <b>Сделка:</b> ${t.deal.title}`
            : "";

          const assignedPart = t.assignedTo?.name
            ? `\n   👨‍💼 <b>Отв-ный:</b> ${t.assignedTo.name}`
            : "";

          // Если у задачи есть привязанная сделка — формируем кнопку Mini App
          if (t.deal?.id) {
            const dealAppUrl = await getTelegramAppUrl({ dealId: t.deal.id });
            const shortDealTitle = t.deal.title.length > 25 ? `${t.deal.title.slice(0, 25)}...` : t.deal.title;
            inlineKeyboard.push([
              {
                text: `💼 ${idx + 1}. Открыть: ${shortDealTitle}`,
                web_app: { url: dealAppUrl },
              },
            ]);
          }

          return `${idx + 1}. ${typeIcon} <b>${typeName}: ${t.title}</b>\n   ⏰ <b>Время:</b> ${timeStr}${contactPart}${dealPart}${assignedPart}`;
        })
      );

      // Общая кнопка открытия раздела задач в Mini App
      const allTasksAppUrl = await getTelegramAppUrl({ redirect: "/tasks" });
      inlineKeyboard.push([
        { text: "📱 Все задачи в Mini App", web_app: { url: allTasksAppUrl } },
      ]);

      replyMarkup = { inline_keyboard: inlineKeyboard };

      messageText = `📋 <b>DAMA CRM: Сводка задач на сегодня</b>\n<i>${dayName}, ${dayNum} ${monthName} ${localDate.getFullYear()} г.</i>\n\n${taskLines.join("\n\n")}\n\n━━━━━━━━━━━━━━━━━━━━\nВсего задач: <b>${tasks.length}</b> • <i>Нажмите кнопку ниже для открытия сделки в Telegram Mini App</i>`;
    }

    const sendRes = await sendTelegramMessage(setting.botToken, setting.chatId, messageText, replyMarkup);
    if (!sendRes.success) {
      return { success: false, error: sendRes.error };
    }

    // Фиксируем дату успешной отправки
    await prisma.telegramSetting.update({
      where: { id: setting.id },
      data: { lastSentDate: dateStr },
    });

    return { success: true, count: tasks.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка формирования сводки задач";
    return { success: false, error: message };
  }
}
