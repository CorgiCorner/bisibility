"use client";

import { type KeywordHit, searchKeywords } from "@/components/shell/keyword-search";
import { useRef, useState } from "react";

const DEBOUNCE_MS = 160;
const MIN_LENGTH = 2;

/**
 * Request versioning drops stale results; server-side search enforces project authorization.
 */
export function useKeywordSearch(projectId: string) {
  const [keywordHits, setKeywordHits] = useState<KeywordHit[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  function search(value: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const term = value.trim();
    if (term.length < MIN_LENGTH) {
      setKeywordHits([]);
      return;
    }
    const requestId = ++requestRef.current;
    debounceRef.current = setTimeout(() => {
      void searchKeywords(projectId, term).then((hits) => {
        if (requestRef.current === requestId) {
          setKeywordHits(hits);
        }
      });
    }, DEBOUNCE_MS);
  }

  return { keywordHits, search };
}
