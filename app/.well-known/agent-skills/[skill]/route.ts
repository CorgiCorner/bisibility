import { createAgentSkillMarkdown, createSkillArchiveBytes } from "@/lib/agent-ready/documents";
import { getSkillZip, getWorkflowSourceIndex } from "@/lib/agent-ready/plugin-skill-archive";
import { textResponse } from "@/lib/agent-ready/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ skill: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { skill } = await context.params;
  if (skill === "workflows.md")
    return textResponse(getWorkflowSourceIndex(), "text/markdown; charset=utf-8");

  if (/\.zip$/i.test(skill)) {
    const slug = skill.replace(/\.zip$/i, "");
    const archive = getSkillZip(slug);
    if (!archive) return new Response("Not found\n", { status: 404 });
    const etag = `"${archive.sha256}"`;
    const headers = {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Content-Type": "application/zip",
      "X-Content-Type-Options": "nosniff",
      ETag: etag,
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(archive.bytes), { headers });
  }

  if (/\.tar\.gz$/i.test(skill)) {
    const slug = skill.replace(/\.tar\.gz$/i, "");
    const archive = createSkillArchiveBytes(slug);
    if (!archive) {
      return new Response("Not found\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        status: 404,
      });
    }
    // `archive` is non-null only for a known task-skill slug, so the download
    // filename is built from the matched slug, never the raw request param.
    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Disposition": `attachment; filename="${slug}.tar.gz"`,
        "Content-Type": "application/gzip",
      },
      status: 200,
    });
  }

  const markdown = createAgentSkillMarkdown(skill);
  if (!markdown) {
    return new Response("Not found\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 404,
    });
  }
  return textResponse(markdown, "text/markdown; charset=utf-8");
}
