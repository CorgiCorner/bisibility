import { lastMarketCookieName } from "@/lib/markets/last-market-cookie";
import { resolveLastMarketRef } from "@/lib/markets/market-context";
import { resolvedContextDestination, routeSearchParams } from "@/lib/markets/market-routes";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { cookies } from "next/headers";
import { permanentRedirect } from "next/navigation";

type ResolvedContextPageProps = {
  params: Promise<{ page: string[]; project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `~` means "the context I was in". It is the ONE place the `last-market` cookie is read, and
 * it never renders anything: it resolves to a real URL and sends the reader there, so what
 * they then see is decided by that URL alone. A cookie naming a market that is absent,
 * unknown, archived or owned by another project resolves to null and drops to the project
 * route, and a project-scoped page drops there whatever the cookie says.
 */
export default async function ResolvedContextPage({
  params,
  searchParams,
}: Readonly<ResolvedContextPageProps>) {
  const { page, project } = await params;
  const access = await resolveProjectAccess(project);
  const store = await cookies();
  const marketRef = await resolveLastMarketRef(
    access.projectId,
    store.get(lastMarketCookieName(access.publicId))?.value,
  );

  permanentRedirect(
    resolvedContextDestination({
      marketRef,
      projectRef: access.publicId,
      search: routeSearchParams(await searchParams),
      section: page ?? [],
    }),
  );
}
