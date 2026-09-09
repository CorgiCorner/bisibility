import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  importMarketLabel,
  type KeywordImportMarketContext,
} from "@/lib/keywords/import-market-context";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";

export function ImportMarketSelection({
  context,
  disabled,
  onChange,
  projectId,
  value,
}: Readonly<{
  context: KeywordImportMarketContext;
  disabled: boolean;
  onChange: (key: string | null) => void;
  projectId?: string;
  value: string | null;
}>) {
  const selected = context.markets.find((market) => market.canonicalKey === value);
  return (
    <section
      aria-label="Import markets"
      className="mb-5 grid gap-2 rounded-control border border-border bg-bg-sunken p-3"
    >
      {context.markets.length ? (
        <>
          <FieldLabel label="Market for rows without a location" />
          <MenuSelect
            ariaLabel="Market for rows without a location"
            disabled={disabled}
            onChange={(key) => onChange(key === "from-file" ? null : key)}
            options={[
              { label: "Use markets from the file", value: "from-file" },
              ...context.markets.map((market) => ({
                label: importMarketLabel(market),
                value: market.canonicalKey,
              })),
            ]}
            size="input"
            value={value ?? "from-file"}
          />
          <p className="m-0 text-[12px] leading-[1.5] text-fg-muted">
            {selected
              ? "Rows without a location use this market. Location fields in the file can select other existing markets."
              : "Each row needs Country or an exact Location key matching an existing market. Language selects the search-result language."}
          </p>
          {selected?.status === "paused" ? (
            <p className="m-0 text-[12px] text-fg-muted" role="status">
              Keywords can be imported here. Rank checks wait until you resume this market.
            </p>
          ) : null}
        </>
      ) : (
        <p className="m-0 text-[13px] text-fg-muted" role="status">
          Create a market before importing keywords. Its location and language determine where
          keywords are tracked.
        </p>
      )}
      {projectId ? (
        <Link
          className="text-[12px] font-medium text-accent-text"
          href={appPath(projectId, "markets")}
        >
          Manage markets
        </Link>
      ) : null}
    </section>
  );
}
