import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getActiveSmtpConfig, sendPasswordResetEmail } from "@/lib/mailer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const identifier = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: "Введите Email для входа или привязанную почту восстановления" },
        { status: 400 }
      );
    }

    const smtpConfig = await getActiveSmtpConfig();

    // Ищем активного пользователя сначала по основному логину, затем по почте восстановления
    let user = await prisma.user.findUnique({
      where: { email: identifier },
    });

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          recoveryEmail: identifier,
          isActive: true,
        },
        orderBy: { role: "asc" }, // ADMIN приоритетнее
      });
    }

    if (!user || !user.isActive) {
      return NextResponse.json({
        success: true,
        smtpConfigured: Boolean(smtpConfig),
        message: smtpConfig
          ? "Если учетная запись с таким адресом найдена, мы отправили инструкцию по сбросу пароля на привязанную почту."
          : "Почтовый сервер (SMTP) еще не настроен. Настройте SMTP в разделе «Настройки» → «Восстановление пароля и SMTP».",
      });
    }

    const destinationEmail = user.recoveryEmail || user.email;

    // Генерируем одноразовый криптографический токен (действует 60 минут)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
      (forwardedProto && forwardedHost
        ? `${forwardedProto}://${forwardedHost}`
        : request.nextUrl.origin);

    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

    if (!smtpConfig) {
      console.warn(
        `[DAMA CRM Auth] SMTP не настроен. Резервная ссылка сброса для ${user.email} (действует 60 мин): ${resetUrl}`
      );
      return NextResponse.json({
        success: true,
        smtpConfigured: false,
        message:
          "Почтовый сервер (SMTP) не настроен, поэтому письмо не может быть отправлено автоматически. Администратор может увидеть резервную ссылку в логах сервера (Runtime Logs) или сбросить пароль другого пользователя в Настройках.",
      });
    }

    if (destinationEmail.endsWith(".local")) {
      console.warn(
        `[DAMA CRM Auth] Нельзя отправить письмо на локальный адрес ${destinationEmail}. Привяжите реальную почту восстановления (recoveryEmail) в Настройках.`
      );
      return NextResponse.json({
        success: true,
        smtpConfigured: true,
        message:
          "Если учетная запись с таким адресом найдена и к ней привязан внешний email, мы отправили инструкцию по сбросу пароля.",
      });
    }

    const mailResult = await sendPasswordResetEmail({
      toEmail: destinationEmail,
      userName: user.name,
      loginEmail: user.email,
      resetUrl,
    });

    if (!mailResult.sent) {
      console.error("[DAMA CRM Auth] Ошибка отправки письма сброса:", mailResult.error);
      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось отправить письмо через настроенный SMTP-сервер. Проверьте настройки SMTP в CRM или журналы сервера.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      smtpConfigured: true,
      message:
        "Если учетная запись с таким адресом найдена, мы отправили письмо со ссылкой для сброса пароля на привязанную почту.",
    });
  } catch (err: unknown) {
    console.error("[DAMA CRM Auth] Forgot password error:", err);
    return NextResponse.json(
      { success: false, error: "Произошла внутренняя ошибка при обработке запроса" },
      { status: 500 }
    );
  }
}
