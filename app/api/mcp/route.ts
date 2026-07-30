import { handleMcpHttpRequest } from "@/lib/mcp/transport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: Request) {
  return handleMcpHttpRequest(req);
}

export function POST(req: Request) {
  return handleMcpHttpRequest(req);
}

export function DELETE(req: Request) {
  return handleMcpHttpRequest(req);
}
