"use client";

import {
  cloneTablePresentation,
  type TablePresentation,
} from "@/lib/saved-views/presentation-model";
import { createContext, type Dispatch, type ReactNode, type SetStateAction, useState } from "react";

export const KeywordPresentationDraftContext = createContext<{
  draft: TablePresentation | null;
  setDraft: Dispatch<SetStateAction<TablePresentation | null>>;
} | null>(null);

/** Parent lifetime survives table pagination; the owner/project/view/revision key resets custody. */
export function KeywordPresentationDraftProvider({
  initial,
  children,
}: {
  initial: TablePresentation | null;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<TablePresentation | null>(() =>
    initial ? cloneTablePresentation(initial) : null,
  );
  return (
    <KeywordPresentationDraftContext value={{ draft, setDraft }}>
      {children}
    </KeywordPresentationDraftContext>
  );
}
