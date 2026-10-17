import { getSkillSourceFile } from "@/lib/agent-ready/plugin-skill-archive";
import { textResponse } from "@/lib/agent-ready/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ skill: string; file: string[] }> };

/** Public workflow source, including references. Never reads request-controlled filesystem paths. */
export async function GET(_request: Request, context: RouteContext) {
  const { skill, file } = await context.params;
  const filename = file.join("/");
  const content = getSkillSourceFile(skill, filename);
  if (content === null) return new Response("Not found\n", { status: 404 });
  return textResponse(
    content,
    filename.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
  );
}
