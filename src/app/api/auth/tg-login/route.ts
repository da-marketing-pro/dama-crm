import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { verifyTelegramSignedToken, getDefaultAdminUser } from "@/lib/telegramAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const dealId = searchParams.get("dealId");
  const redirectParam = searchParams.get("redirect");
  const isAuto = searchParams.get("auto") === "1";

  let targetUserId: string | null = null;
  let targetRedirect = redirectParam || (dealId ? `/deals?dealId=${dealId}` : "/deals");

  if (token) {
    const verified = verifyTelegramSignedToken(token);
    if (verified.valid && verified.userId) {
      targetUserId = verified.userId;
      if (verified.dealId) targetRedirect = `/deals?dealId=${verified.dealId}`;
      if (verified.redirect) targetRedirect = verified.redirect;
    }
  }

  // If token was not provided or invalid, but auto=1 was specified (e.g. from Menu button)
  if (!targetUserId && isAuto) {
    const admin = await getDefaultAdminUser();
    if (admin) {
      targetUserId = admin.id;
    }
  }

  if (!targetUserId) {
    return NextResponse.redirect(new URL("/login?error=InvalidTelegramToken", req.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL("/login?error=UserNotFound", req.url));
  }

  const sessionSecret = process.env.NEXTAUTH_SECRET || "crm-modular-secret-key-super-secure-12345";

  // Create valid NextAuth session token
  const sessionToken = await encode({
    token: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    secret: sessionSecret,
    maxAge: 30 * 24 * 60 * 60,
  });

  const response = NextResponse.redirect(new URL(targetRedirect, req.url));

  const isHttps = req.headers.get("x-forwarded-proto") === "https" || req.url.startsWith("https:");

  // Set session cookies for both secure and standard
  response.cookies.set("next-auth.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  if (isHttps) {
    response.cookies.set("__Secure-next-auth.session-token", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  }

  return response;
}
