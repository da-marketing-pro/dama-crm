export interface WhatsappQuickTemplate {
  id: string;
  title: string;
  text: string;
}

export const AUTODIALER_WELCOME_TEMPLATE_ID = "autodialer-callback-welcome";

export const DEFAULT_AUTODIALER_WELCOME_TEXT = `*Добрый день.*

*Вы откликнулись на наш обзвон с предложением разбора продвижения и продаж в вашем бизнесе.*

Немного познакомимся. Меня зовут Денис Бедарев. Я руководитель агентства комплексного маркетинга DA Marketing.
За последние 6 проектов мы принесли нашим клиентам более $3 300 000 дохода.

Мы делаем продвижение и создаем каналы продаж, которые приносят реальную прибыль.

*Когда вам удобно созвониться для проведения разбора?*

*На созвоне мы за 30 - 40 минут разберем вашу ситуацию и покажем точки роста*, с минимальными вложениями.

Ответьте на это сообщение и мы согласуем удобное время.`;

export const DEFAULT_WHATSAPP_QUICK_TEMPLATES: WhatsappQuickTemplate[] = [
  {
    id: AUTODIALER_WELCOME_TEMPLATE_ID,
    title: "Отклик автообзвон (разбор)",
    text: DEFAULT_AUTODIALER_WELCOME_TEXT,
  },
];

export function normalizeQuickTemplates(raw: unknown): WhatsappQuickTemplate[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_WHATSAPP_QUICK_TEMPLATES;
  }

  const parsed: WhatsappQuickTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `tpl-${parsed.length + 1}`;
    const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "";
    const text = typeof obj.text === "string" && obj.text.trim() ? obj.text : "";
    if (!title || !text) continue;
    parsed.push({ id, title, text });
  }

  return parsed.length > 0 ? parsed : DEFAULT_WHATSAPP_QUICK_TEMPLATES;
}
