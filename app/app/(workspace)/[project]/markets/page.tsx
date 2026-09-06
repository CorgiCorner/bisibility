import { PageContent } from "@/components/shell/PageContent";
import { AccentCtaLink, InlineCallout } from "@/components/ui";
import { archivedMarketNote } from "@/lib/markets/archived";
import { ARCHIVED_MARKET_NOTE_PARAM, archivedMarketNoteRef } from "@/lib/markets/market-routes";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { appPath } from "@/lib/routing/app-path";

type MarketsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The canonical markets route named by the URL contract. Markets are still administered with
 * the rest of the tracking defaults, so this route owns the address and the archived-market
 * note while the registry UI stays where it is.
 */
export default async function MarketsPage({ params, searchParams }: Readonly<MarketsPageProps>) {
  const { project } = await params;
  const access = await resolveProjectAccess(project);
  // The note echoes the id back to the reader, so the query value is shape-checked before it
  // reaches the page rather than after.
  const archivedRef = archivedMarketNoteRef((await searchParams)?.[ARCHIVED_MARKET_NOTE_PARAM]);

  return (
    <PageContent variant="constrained">
      {archivedRef ? (
        <InlineCallout className="mb-4" tint="yellow">
          {archivedMarketNote(archivedRef)}
        </InlineCallout>
      ) : null}
      <p className="mb-4 text-[13px] text-fg-muted">
        Markets are the navigation level your tracked keywords are measured in. They are
        administered with the rest of your tracking defaults.
      </p>
      <AccentCtaLink href={appPath(access.publicId, "settings", "tracking")}>
        Manage markets
      </AccentCtaLink>
    </PageContent>
  );
}
