import { handleMcpHttpRequest } from "@/lib/mcp/transport";

// Provider work has a 40-second aggregate budget, leaving time to settle usage and save results.
export const maxDuration = 60;

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
