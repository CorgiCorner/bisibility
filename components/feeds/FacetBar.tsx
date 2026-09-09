"use client";

import { AddFilterMenu } from "@/components/feeds/AddFilterMenu";
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
  options,
}: Readonly<{
  facets: readonly FeedFacet[];
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
    <fieldset aria-label="Feed facets" className="flex flex-wrap items-center gap-2 border-0 p-0">
      {facets.map((facet) => (
        <FacetToken
          facet={facet}
          key={`${facet.axis}:${facet.value}`}
          label={feedFacetLabel(facet, options)}
          onRemove={(removed) => navigate(removeFeedFacet(current, removed, options))}
        />
      ))}
      <AddFilterMenu
        facets={facets}
        onAdd={(added) => navigate(addFeedFacet(current, added, options))}
        options={options}
      />
    </fieldset>
  );
}
