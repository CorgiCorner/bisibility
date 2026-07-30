import { DOCS_URL } from "@/lib/site/site";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const target = new URL(DOCS_URL);
  target.search = new URL(request.url).search;

  return Response.redirect(target, 308);
}
