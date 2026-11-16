/**
 * Google Calendar & iCalendar (.ics) integration service for DAMA CRM.
 * Provides standard RFC 5545 feed and 1-click Google Calendar web links.
 */

export function formatIcsTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export interface CalendarTaskData {
  id: string;
  title: string;
  taskType?: string | null;
  description?: string | null;
  dueDate: Date | string;
  isCompleted?: boolean;
  deal?: { id: string; title: string; contact?: { phone?: string | null } | null } | null;
  contact?: { id: string; name: string; phone?: string | null; company?: string | null } | null;
  assignedTo?: { id: string; name: string } | null;
}

export function getTaskTypeLabel(type?: string | null): string {
  switch (type) {
    case "CALL":
      return "Звонок";
    case "MEETING":
      return "Встреча";
    case "MESSAGE":
      return "Написать в WhatsApp";
    case "TASK":
    default:
      return "Задача";
  }
}

/**
 * Генерирует стандартный RFC 5545 iCalendar документ для подписки в Google Календаре.
 */
export function generateTasksIcsFeed(
  tasks: CalendarTaskData[],
  calendarName = "Задачи DAMA CRM (Admin)",
  appOrigin = "https://crm.da-marketing.pro"
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DAMA CRM//Tasks Calendar 2.0//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Almaty",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  const now = new Date();
  const dtstamp = formatIcsTimestamp(now);

  for (const task of tasks) {
    const startDate = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
    if (isNaN(startDate.getTime())) continue;

    // Продолжительность задачи по умолчанию — 30 минут
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

    const typeLabel = getTaskTypeLabel(task.taskType);
    const summary = `[${typeLabel}] ${task.title}`;

    const descParts: string[] = [];
    if (task.description) {
      descParts.push(`Описание: ${task.description}`);
    }
    if (task.contact?.name) {
      descParts.push(`Клиент: ${task.contact.name}${task.contact.company ? ` (${task.contact.company})` : ""}`);
    }
    const phone = task.contact?.phone || task.deal?.contact?.phone;
    if (phone) {
      descParts.push(`Телефон: ${phone}`);
    }
    if (task.deal?.title) {
      descParts.push(`Сделка: ${task.deal.title}`);
      descParts.push(`Ссылка в CRM: ${appOrigin}/deals?dealId=${task.deal.id}`);
    } else {
      descParts.push(`Ссылка в CRM: ${appOrigin}/tasks`);
    }

    const description = descParts.join("\n");
    const taskUrl = task.deal?.id ? `${appOrigin}/deals?dealId=${task.deal.id}` : `${appOrigin}/tasks`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:task-${task.id}@crm.da-marketing.pro`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatIcsTimestamp(startDate)}`,
      `DTEND:${formatIcsTimestamp(endDate)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `URL:${taskUrl}`,
      `STATUS:${task.isCompleted ? "CANCELLED" : "CONFIRMED"}`,
      // Напоминание 1: за 15 минут до задачи
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`Напоминание о задаче: ${summary}`)}`,
      "TRIGGER:-PT15M",
      "END:VALARM",
      // Напоминание 2: за 10 минут до задачи
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`Через 10 минут: ${summary}`)}`,
      "TRIGGER:-PT10M",
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Создает прямую веб-ссылку для добавления конкретной задачи в Google Календарь в 1 клик.
 */
export function getGoogleCalendarTemplateUrl(task: {
  title: string;
  taskType?: string | null;
  dueDate: Date | string;
  description?: string | null;
  dealTitle?: string | null;
  dealId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}, appOrigin = "https://crm.da-marketing.pro"): string {
  const startDate = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

  const startStr = formatIcsTimestamp(startDate);
  const endStr = formatIcsTimestamp(endDate);

  const typeLabel = getTaskTypeLabel(task.taskType);
  const eventTitle = `[${typeLabel}] ${task.title}`;

  const descParts: string[] = [];
  if (task.description) descParts.push(task.description);
  if (task.contactName) descParts.push(`Клиент: ${task.contactName}`);
  if (task.contactPhone) descParts.push(`Телефон: ${task.contactPhone}`);
  if (task.dealTitle) descParts.push(`Сделка: ${task.dealTitle}`);
  if (task.dealId) descParts.push(`Ссылка в CRM: ${appOrigin}/deals?dealId=${task.dealId}`);

  const details = descParts.join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle,
    dates: `${startStr}/${endStr}`,
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
