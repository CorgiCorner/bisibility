"use client";

import type { listKeywordSuggestionSources } from "@/lib/actions/keyword-suggestion-sources";
import { useRef, useState } from "react";

type Sources = Awaited<ReturnType<typeof listKeywordSuggestionSources>>;
type State = { projectId: string; sources: Sources | null; failed: boolean };

export function useKeywordSuggestionSources(projectId: string) {
  const [state, setState] = useState<State>({ projectId, sources: null, failed: false });
  const latestRequest = useRef(0);
  async function load() {
    const request = ++latestRequest.current;
    setState({ projectId, sources: null, failed: false });
    try {
      const { listKeywordSuggestionSources } = await import(
        "@/lib/actions/keyword-suggestion-sources"
      );
      const sources = await listKeywordSuggestionSources({ projectId });
      if (request === latestRequest.current) setState({ projectId, sources, failed: false });
    } catch {
      if (request === latestRequest.current) setState({ projectId, sources: null, failed: true });
    }
  }
  return {
    sources: state.projectId === projectId ? state.sources : null,
    failed: state.projectId === projectId && state.failed,
    load,
  };
}
