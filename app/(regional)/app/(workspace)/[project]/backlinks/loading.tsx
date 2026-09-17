import { BacklinksPageLoading } from "@/components/backlinks/BacklinksLoadingSkeletons";
import { BacklinksMessagesBoundary } from "@/components/backlinks/BacklinksMessagesBoundary";

// Next renders this fallback as a SIBLING of page.tsx, outside the boundary the page mounts, so
// the skeleton would otherwise resolve `projectBacklinks` against the `shared`-only request config.
export default function BacklinksLoading() {
  return (
    <BacklinksMessagesBoundary>
      <BacklinksPageLoading />
    </BacklinksMessagesBoundary>
  );
}
