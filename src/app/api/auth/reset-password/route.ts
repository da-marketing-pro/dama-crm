import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ valid: false, error: "Токен не указан" }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { email: true, isActive: true },
      },
    },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.isActive) {
    return NextResponse.json(
      { valid: false, error: "Ссылка недействительна или срок её действия истек" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    valid: true,
    loginEmail: record.user.email,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const rawToken = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!rawToken) {
      return NextResponse.json(
        { success: false, error: "Отсутствует токен сброса пароля" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Новый пароль должен содержать не менее 6 символов" },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(rawToken);
    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.usedAt ||
      tokenRecord.expiresAt <= new Date() ||
      !tokenRecord.user.isActive
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Ссылка для сброса пароля недействительна или истекла. Запросите новую.",
        },
        { status: 400 }
      );
    }

    const newPasswordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Пароль успешно обновлен. Теперь вы можете войти с новым паролем.",
    });
  } catch (err: unknown) {
    console.error("[DAMA CRM Auth] Reset password error:", err);
    return NextResponse.json(
      { success: false, error: "Ошибка при обновлении пароля" },
      { status: 500 }
    );
  }
}
