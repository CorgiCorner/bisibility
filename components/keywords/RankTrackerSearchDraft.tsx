"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo } from "react";

function createSearchDraft() {
  let draft: string | null = null;
  let committed: string | null = null;
  return {
    read: (fallback: string) => draft ?? fallback,
    write: (value: string) => {
      draft = value;
    },
    commit: (value: string) => {
      draft = value;
      committed = value;
    },
    wasCommitted: (value: string, fallback: string) => value === (committed ?? fallback),
  };
}

const SearchDraftContext = createContext<ReturnType<typeof createSearchDraft> | null>(null);

/** Shares event-time search state between the parallel header slot and the table.
 * A committed URL change gets a fresh draft, including back/forward and project changes.
 * Keystrokes do not rerender the shell or navigate; the table owns its visible input.
 */
export function RankTrackerSearchDraftProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const route = `${pathname}?${params.toString()}`;
  const scope = useMemo(() => ({ route, draft: createSearchDraft() }), [route]);
  return <SearchDraftContext value={scope.draft}>{children}</SearchDraftContext>;
}

export function useRankTrackerSearchDraft() {
  return useContext(SearchDraftContext);
}
