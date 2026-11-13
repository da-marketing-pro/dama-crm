import crypto from "crypto";
import { prisma } from "./prisma";
import { Role } from "@prisma/client";

const AUTH_SECRET = process.env.NEXTAUTH_SECRET || "crm-modular-secret-key-super-secure-12345";

export function generateTelegramSignedToken(payload: {
  userId: string;
  dealId?: string;
  redirect?: string;
  expiresInSeconds?: number;
}): string {
  const expiresAt = Date.now() + (payload.expiresInSeconds || 30 * 24 * 60 * 60) * 1000;
  const data = JSON.stringify({
    userId: payload.userId,
    dealId: payload.dealId || "",
    redirect: payload.redirect || "",
    exp: expiresAt,
  });
  const dataBase64 = Buffer.from(data).toString("base64url");
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(dataBase64)
    .digest("base64url");
  return `${dataBase64}.${signature}`;
}

export function verifyTelegramSignedToken(token: string): {
  valid: boolean;
  userId?: string;
  dealId?: string;
  redirect?: string;
} {
  try {
    const [dataBase64, signature] = token.split(".");
    if (!dataBase64 || !signature) return { valid: false };

    const expectedSig = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(dataBase64)
      .digest("base64url");

    if (signature !== expectedSig) return { valid: false };

    const json = JSON.parse(Buffer.from(dataBase64, "base64url").toString());
    if (json.exp && json.exp < Date.now()) {
      return { valid: false };
    }

    return {
      valid: true,
      userId: json.userId,
      dealId: json.dealId,
      redirect: json.redirect,
    };
  } catch {
    return { valid: false };
  }
}

export async function getDefaultAdminUser() {
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return admin;
}

export async function getTelegramAppUrl(options: { dealId?: string; redirect?: string } = {}) {
  const admin = await getDefaultAdminUser();
  if (!admin) return "https://crm.da-marketing.pro/login";

  const token = generateTelegramSignedToken({
    userId: admin.id,
    dealId: options.dealId,
    redirect: options.redirect,
  });

  const baseUrl = "https://crm.da-marketing.pro";
  const params = new URLSearchParams();
  params.set("token", token);
  if (options.dealId) params.set("dealId", options.dealId);
  if (options.redirect) params.set("redirect", options.redirect);

  return `${baseUrl}/api/auth/tg-login?${params.toString()}`;
}

export function verifyTelegramWebAppData(
  initDataString: string,
  botToken: string
): { valid: boolean; user?: { id: number; username?: string; first_name?: string } } {
  try {
    const params = new URLSearchParams(initDataString);
    const hash = params.get("hash");
    if (!hash) return { valid: false };

    params.delete("hash");

    // Sort parameters alphabetically
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join("\n");

    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // calculated_hash = HMAC_SHA256(secret_key, dataCheckString)
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculatedHash !== hash) {
      return { valid: false };
    }

    const userRaw = params.get("user");
    const user = userRaw ? JSON.parse(userRaw) : undefined;

    return { valid: true, user };
  } catch {
    return { valid: false };
  }
}
