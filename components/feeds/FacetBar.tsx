"use client";

import { AddFilterMenu, type FeedFacetLabels } from "@/components/feeds/AddFilterMenu";
import { FacetToken } from "@/components/feeds/FacetToken";
import {
  addFeedFacet,
  type FeedFacet,
  type FeedFacetOptions,
  feedFacetLabel,
  removeFeedFacet,
} from "@/lib/feeds/facets";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function hrefFor(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function FacetBar({
  facets,
  labels,
  options,
}: Readonly<{
  facets: readonly FeedFacet[];
  labels: FeedFacetLabels;
  options: FeedFacetOptions;
}>) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = new URLSearchParams(searchParams?.toString());

  function navigate(params: URLSearchParams) {
    router.push(hrefFor(pathname, params));
  }

  return (
    <fieldset
      aria-label={labels.addFeedFilter}
      className="flex flex-wrap items-center gap-2 border-0 p-0"
    >
      {facets.map((facet) => (
        <FacetToken
          facet={facet}
          key={`${facet.axis}:${facet.value}`}
          label={feedFacetLabel(facet, options)}
          labels={labels}
          onRemove={(removed) => navigate(removeFeedFacet(current, removed, options))}
        />
      ))}
      <AddFilterMenu
        facets={facets}
        labels={labels}
        onAdd={(added) => navigate(addFeedFacet(current, added, options))}
        options={options}
      />
    </fieldset>
  );
}
