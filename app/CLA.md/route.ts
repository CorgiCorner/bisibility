import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const body = await readFile(join(process.cwd(), "CLA.md"), "utf8");

  return new Response(body.endsWith("\n") ? body : `${body}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
