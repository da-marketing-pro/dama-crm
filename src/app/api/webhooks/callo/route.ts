import { NextRequest } from "next/server";
import { handleCalloWebhookRequest } from "./handler";

export async function GET(req: NextRequest) {
  return handleCalloWebhookRequest(req);
}

export async function POST(req: NextRequest) {
  return handleCalloWebhookRequest(req);
}
