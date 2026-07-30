import { DOCS_URL } from "@/lib/site/site";

type DocsPathContext = {
  params: Promise<{ path: string[] }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: DocsPathContext) {
  const { path } = await params;
  const target = new URL(
    `${DOCS_URL.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}`,
  );
  target.search = new URL(request.url).search;

  return Response.redirect(target, 308);
}
