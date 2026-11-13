import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendTelegramMessage,
  sendDailyTasksDigest,
} from "@/lib/telegramService";
import { getTelegramAppUrl } from "@/lib/telegramAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // Обработка текстовых сообщений
    if (update.message && update.message.text) {
      const chatId = String(update.message.chat.id);
      const text = (update.message.text as string).trim();

      const setting = await prisma.telegramSetting.findFirst();
      if (!setting || !setting.botToken) {
        return NextResponse.json({ ok: true });
      }

      const botToken = setting.botToken;

      // 1. Команда /start
      if (text.startsWith("/start")) {
        const crmUrl = await getTelegramAppUrl({ redirect: "/deals" });
        const tasksUrl = await getTelegramAppUrl({ redirect: "/tasks" });

        const greeting = `👋 <b>Привет, ${update.message.from?.first_name || "Денис"}!</b>

Я бот корпоративной системы <b>DAMA CRM</b>.
Теперь вы можете полноценно пользоваться CRM прямо внутри Telegram через <b>Telegram Mini App</b>!

<b>Что умеет бот:</b>
• Каждое утро в 09:45 присылает сводку задач с прямыми ссылками на сделки.
• Нажмите <b>«📱 Открыть CRM»</b> внизу экрана или по кнопке ниже, чтобы войти в систему без пароля.
• Отправьте команду <b>/tasks</b> для получения задач на сегодня.
• Отправьте команду <b>/deals</b> для просмотра активных сделок.
• Отправьте имя клиента, компанию или номер телефона для быстрого поиска!`;

        const replyMarkup = {
          inline_keyboard: [
            [{ text: "📱 Открыть DAMA CRM (Mini App)", web_app: { url: crmUrl } }],
            [
              { text: "📋 Задачи на сегодня", callback_data: "cmd_tasks" },
              { text: "💼 Активные сделки", callback_data: "cmd_deals" },
            ],
          ],
        };

        await sendTelegramMessage(botToken, chatId, greeting, replyMarkup);
        return NextResponse.json({ ok: true });
      }

      // 2. Команда /crm
      if (text.startsWith("/crm")) {
        const crmUrl = await getTelegramAppUrl({ redirect: "/deals" });
        await sendTelegramMessage(botToken, chatId, "📱 Нажмите кнопку ниже для запуска DAMA CRM в формате Mini App:", {
          inline_keyboard: [[{ text: "📱 Открыть DAMA CRM (Mini App)", web_app: { url: crmUrl } }]],
        });
        return NextResponse.json({ ok: true });
      }

      // 3. Команда /tasks или "задачи"
      if (text.startsWith("/tasks") || /задач/i.test(text)) {
        await sendDailyTasksDigest({ force: true });
        return NextResponse.json({ ok: true });
      }

      // 4. Команда /deals или "сделки"
      if (text.startsWith("/deals") || /сделк/i.test(text)) {
        const deals = await prisma.deal.findMany({
          take: 6,
          orderBy: { updatedAt: "desc" },
          include: {
            contact: { select: { name: true, company: true, phone: true } },
            stage: { select: { name: true } },
          },
        });

        if (deals.length === 0) {
          await sendTelegramMessage(botToken, chatId, "В системе пока нет активных сделок.");
          return NextResponse.json({ ok: true });
        }

        const inlineKeyboard: Array<Array<{ text: string; web_app: { url: string } }>> = [];

        const lines = await Promise.all(
          deals.map(async (d, idx) => {
            const dealUrl = await getTelegramAppUrl({ dealId: d.id });
            const shortTitle = d.title.length > 25 ? `${d.title.slice(0, 25)}...` : d.title;

            inlineKeyboard.push([
              {
                text: `💼 ${idx + 1}. ${shortTitle}`,
                web_app: { url: dealUrl },
              },
            ]);

            const contactPart = d.contact?.name
              ? `\n   👤 <b>Клиент:</b> ${d.contact.name}${d.contact.company ? ` (${d.contact.company})` : ""}${d.contact.phone ? ` • <code>${d.contact.phone}</code>` : ""}`
              : "";

            return `${idx + 1}. <b>${d.title}</b>\n   🏷 <b>Этап:</b> ${d.stage.name}${contactPart}\n   💰 <b>Бюджет:</b> ${d.totalBudget} ${d.currency}`;
          })
        );

        const allDealsUrl = await getTelegramAppUrl({ redirect: "/deals" });
        inlineKeyboard.push([
          { text: "📱 Все сделки в Mini App", web_app: { url: allDealsUrl } },
        ]);

        const messageText = `💼 <b>Активные сделки в CRM:</b>\n\n${lines.join("\n\n")}\n\n<i>Нажмите на кнопку сделки ниже, чтобы открыть карточку в Telegram Mini App.</i>`;

        await sendTelegramMessage(botToken, chatId, messageText, { inline_keyboard: inlineKeyboard });
        return NextResponse.json({ ok: true });
      }

      // 4. Поиск по тексту (имя клиента, телефон, название сделки)
      const searchQuery = text.replace(/^[/#]/, "").trim();
      if (searchQuery.length >= 2) {
        const foundDeals = await prisma.deal.findMany({
          where: {
            OR: [
              { title: { contains: searchQuery, mode: "insensitive" } },
              { contact: { name: { contains: searchQuery, mode: "insensitive" } } },
              { contact: { company: { contains: searchQuery, mode: "insensitive" } } },
              { contact: { phone: { contains: searchQuery } } },
            ],
          },
          take: 4,
          include: {
            contact: { select: { name: true, company: true, phone: true } },
            stage: { select: { name: true } },
          },
        });

        if (foundDeals.length > 0) {
          const inlineKeyboard: Array<Array<{ text: string; web_app: { url: string } }>> = [];

          const lines = await Promise.all(
            foundDeals.map(async (d, idx) => {
              const dealUrl = await getTelegramAppUrl({ dealId: d.id });
              const shortTitle = d.title.length > 25 ? `${d.title.slice(0, 25)}...` : d.title;

              inlineKeyboard.push([
                {
                  text: `💼 ${shortTitle}`,
                  web_app: { url: dealUrl },
                },
              ]);

              return `${idx + 1}. <b>${d.title}</b>\n   👤 <b>Контакт:</b> ${d.contact.name || "—"}${d.contact.company ? ` (${d.contact.company})` : ""}\n   📞 <b>Телефон:</b> <code>${d.contact.phone || "—"}</code>\n   🏷 <b>Этап:</b> ${d.stage.name}`;
            })
          );

          const resultText = `🔍 <b>Результаты поиска по «${searchQuery}»:</b>\n\n${lines.join("\n\n")}`;
          await sendTelegramMessage(botToken, chatId, resultText, { inline_keyboard: inlineKeyboard });
          return NextResponse.json({ ok: true });
        }
      }

      // 5. Ответ по умолчанию с кнопкой запуска Mini App
      const crmUrl = await getTelegramAppUrl({ redirect: "/deals" });
      const defaultText = `Я получил ваше сообщение: «${text}».\n\nИспользуйте меню или нажмите кнопку ниже, чтобы открыть CRM:`;
      await sendTelegramMessage(botToken, chatId, defaultText, {
        inline_keyboard: [
          [{ text: "📱 Открыть DAMA CRM (Mini App)", web_app: { url: crmUrl } }],
          [{ text: "📋 Задачи на сегодня", callback_data: "cmd_tasks" }],
        ],
      });
    }

    // Обработка кликов по inline-кнопкам (callback_query)
    if (update.callback_query) {
      const data = update.callback_query.data;
      if (data === "cmd_tasks") {
        await sendDailyTasksDigest({ force: true });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Ошибка Telegram Webhook:", err);
    return NextResponse.json({ ok: true });
  }
}
