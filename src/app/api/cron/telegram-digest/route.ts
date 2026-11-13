import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendDailyTasksDigest } from "@/lib/telegramService";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const validSecrets = new Set([
    "dama_crm_cron_secret_token_secure_9921",
    process.env.CRON_SECRET,
  ].filter(Boolean));

  // 1. Authorization header
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (validSecrets.has(token)) return true;
  }

  // 2. x-cron-secret header
  const customHeader = req.headers.get("x-cron-secret");
  if (customHeader && validSecrets.has(customHeader.trim())) return true;

  // 3. Query param ?secret=...
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get("secret");
  if (secretParam && validSecrets.has(secretParam.trim())) return true;

  // 4. Admin session check
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role === "ADMIN") return true;
  } catch {}

  return false;
}

export async function GET(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";

  const result = await sendDailyTasksDigest({ force });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";

  const result = await sendDailyTasksDigest({ force });
  return NextResponse.json(result);
}
