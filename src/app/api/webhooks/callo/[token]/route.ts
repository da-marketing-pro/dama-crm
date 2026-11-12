import { NextRequest } from "next/server";
import { handleCalloWebhookRequest } from "../handler";

export async function GET(
  req: NextRequest,
  context: { params: { token: string } }
) {
  return handleCalloWebhookRequest(req, context.params.token);
}

export async function POST(
  req: NextRequest,
  context: { params: { token: string } }
) {
  return handleCalloWebhookRequest(req, context.params.token);
}
