import { handleMcpHttpRequest } from "@/lib/mcp/transport";

// The transport has a 260-second application budget before the platform deadline.
export const maxDuration = 300;

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
