import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

/**
 * Получает актуальные настройки SMTP из базы данных (приоритетно)
 * или из переменных окружения (.env).
 */
export async function getActiveSmtpConfig(): Promise<ResolvedSmtpConfig | null> {
  const dbSmtp = await prisma.smtpSetting.findFirst();

  if (dbSmtp && dbSmtp.enabled && dbSmtp.host && dbSmtp.user && dbSmtp.password) {
    return {
      host: dbSmtp.host.trim(),
      port: dbSmtp.port || 465,
      secure: dbSmtp.port === 465 ? true : dbSmtp.secure,
      user: dbSmtp.user.trim(),
      pass: dbSmtp.password,
      fromEmail: (dbSmtp.fromEmail || dbSmtp.user).trim(),
      fromName: dbSmtp.fromName?.trim() || "DAMA CRM",
    };
  }

  const envHost = process.env.SMTP_HOST;
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASS;

  if (envHost && envUser && envPass) {
    const port = parseInt(process.env.SMTP_PORT || "465", 10);
    return {
      host: envHost.trim(),
      port,
      secure: port === 465 || process.env.SMTP_SECURE === "true",
      user: envUser.trim(),
      pass: envPass,
      fromEmail: (process.env.SMTP_FROM || envUser).trim(),
      fromName: process.env.SMTP_FROM_NAME || "DAMA CRM",
    };
  }

  return null;
}

/**
 * Отправка произвольного письма через активный SMTP-транспорт.
 */
export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  configOverride?: ResolvedSmtpConfig;
}): Promise<{ sent: boolean; error?: string }> {
  const config = params.configOverride || (await getActiveSmtpConfig());

  if (!config) {
    return { sent: false, error: "Почтовый сервер (SMTP) не настроен" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка отправки письма";
    console.error("[DAMA CRM Mailer] SMTP Error:", msg);
    return { sent: false, error: msg };
  }
}

/**
 * Отправка письма с одноразовой ссылкой для сброса пароля.
 */
export async function sendPasswordResetEmail(params: {
  toEmail: string;
  userName: string;
  loginEmail: string;
  resetUrl: string;
}) {
  const { toEmail, userName, loginEmail, resetUrl } = params;

  const subject = "Восстановление пароля — DAMA CRM";
  const text = [
    `Здравствуйте, ${userName}!`,
    "",
    `Мы получили запрос на сброс пароля для вашей учетной записи (${loginEmail}) в DAMA CRM.`,
    "Чтобы задать новый пароль, перейдите по ссылке (действительна 1 час):",
    resetUrl,
    "",
    "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 16px;">
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 12px; color: #0f172a; font-size: 20px;">Восстановление пароля в DAMA CRM</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Здравствуйте, <strong>${escapeHtml(userName)}</strong>!<br/>
          Был запрошен сброс пароля для аккаунта <strong>${escapeHtml(loginEmail)}</strong>.
        </p>
        <p style="margin: 24px 0;">
          <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 10px;">
            Задать новый пароль
          </a>
        </p>
        <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 12px;">
          Ссылка действительна в течение <strong>1 часа</strong> и может быть использована только один раз.<br/>
          Если кнопка не нажимается, скопируйте ссылку в браузер:
        </p>
        <p style="background: #f1f5f9; padding: 10px 12px; border-radius: 8px; font-size: 11px; color: #475569; word-break: break-all; margin: 0 0 16px;">
          ${escapeHtml(resetUrl)}
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          Если вы не отправляли этот запрос, просто проигнорируйте это письмо.
        </p>
      </div>
    </div>
  `;

  return sendMail({ to: toEmail, subject, text, html });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
