import { handleApiRequest } from "@/lib/api/router";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

export function GET(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, context);
}

export function POST(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, context);
}

export function PATCH(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, context);
}

export function DELETE(req: NextRequest, context: RouteContext) {
  return handleApiRequest(req, context);
}
