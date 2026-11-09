"use client";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  launchSerpPlaygroundAction,
  previewSerpPlaygroundAction,
  readSerpPlaygroundAction,
} from "@/lib/actions/serp-playground";
import type { PlaygroundPageData } from "@/lib/provider-comparison/playground-model";
import type {
  ComparisonPreview,
  ComparisonProvider,
  ComparisonRun,
} from "@/lib/provider-comparison/types";
import { useEffect, useRef, useState } from "react";
export const playgroundActions = {
  preview: previewSerpPlaygroundAction,
  launch: launchSerpPlaygroundAction,
  read: readSerpPlaygroundAction,
};
export function useSerpPlayground(
  projectRef: string,
  data: PlaygroundPageData,
  service: typeof playgroundActions,
) {
  const [depth, setDepth] = useState<import("@/lib/serp/constants").SerpDepth>(20);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<LocationFieldValue>(data.location);
  const [language, setLanguage] = useState(data.location.languageCode);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [providers, setProviders] = useState<ComparisonProvider[]>(
    data.providers
      .filter((item) =>
        data.providers.some((provider) => provider.ready)
          ? item.ready && item.selectedByDefault !== false
          : data.history.some((run) => run.sides.some((side) => side.provider === item.provider)),
      )
      .map((item) => item.provider),
  );
  const [view, setView] = useState<"serp" | "json" | "provider">("serp");
  const [history, setHistory] = useState(data.history);
  const [run, setRun] = useState<ComparisonRun | null>(null);
  const [review, setReview] = useState<{ preview: ComparisonPreview; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<
    "searchFailed" | "locationFailed" | "stillRunning" | "accessRequired" | null
  >(null);
  const inflight = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hasConnection = data.providers.some((item) => item.ready) || data.history.length > 0;
  const activeProviders = run
    ? run.sides.map((side) => side.provider)
    : providers.length
      ? providers
      : data.providers.map((item) => item.provider);
  const pendingRun =
    run?.sides.some((side) => side.status === "queued" || side.status === "claimed") ?? false;
  function selectRun(selected: ComparisonRun) {
    setRun(selected);
    setDepth(selected.depth);
    setQuery(selected.keyword.text);
    setDevice(selected.keyword.device);
    setProviders(selected.sides.map((side) => side.provider));
    if (selected.search) {
      const search = selected.search;
      setLanguage(search.language);
      setLocation({
        canonicalKey: search.locationKey,
        kind: search.locationKind,
        countryCode: search.countryCode,
        displayName: selected.keyword.locationLabel,
        languageCode: search.language,
        languageLabel: search.language,
      });
    }
  }
  async function preview(fresh = false) {
    if (inflight.current || !query.trim() || !providers.length) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await service.preview({
        projectRef,
        ...(fresh ? { fresh: true } : {}),
        depth,
        query,
        device,
        locationKey: `${location.canonicalKey.split("@")[0]}@${language}`,
        providers,
      });
      if (!mounted.current) return;
      if (response.ok && "cached" in response && response.cached) {
        setRun(response.cached);
      } else if (response.ok) setReview({ preview: response.preview, key: crypto.randomUUID() });
      else
        setError(
          response.reason === "access"
            ? "accessRequired"
            : response.reason === "location"
              ? "locationFailed"
              : "searchFailed",
        );
    } catch {
      if (mounted.current) setError("searchFailed");
    } finally {
      inflight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function launch() {
    if (!review || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await service.launch({
        projectRef,
        previewId: review.preview.id,
        previewHash: review.preview.hash,
        requestKey: review.key,
      });
      if (!mounted.current) return;
      if (!response.ok) {
        setError("searchFailed");
        return;
      }
      setReview(null);
      let current = response.run;
      setRun(current);
      setHistory((previous) =>
        [current, ...previous.filter((item) => item.id !== current.id)].slice(0, 12),
      );
      for (
        let attempt = 0;
        attempt < 150 &&
        current.sides.some((side) => side.status === "queued" || side.status === "claimed");
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!mounted.current) return;
        const result = await service.read({ projectRef, runId: current.id });
        if (!mounted.current) return;
        if (!result.ok) {
          setError("stillRunning");
          return;
        }
        current = result.run;
        setRun(current);
        setHistory((previous) => previous.map((item) => (item.id === current.id ? current : item)));
      }
      if (current.sides.some((side) => side.status === "queued" || side.status === "claimed"))
        setError("stillRunning");
    } catch {
      if (mounted.current) setError("searchFailed");
    } finally {
      inflight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh() {
    if (!run || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await service.read({ projectRef, runId: run.id });
      if (!mounted.current) return;
      if (!response.ok) {
        setError("stillRunning");
        return;
      }
      setRun(response.run);
      setHistory((previous) =>
        previous.map((item) => (item.id === response.run.id ? response.run : item)),
      );
    } catch {
      if (mounted.current) setError("stillRunning");
    } finally {
      inflight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    depth,
    setDepth,
    query,
    setQuery,
    location,
    setLocation,
    language,
    setLanguage,
    device,
    setDevice,
    providers,
    setProviders,
    view,
    setView,
    history,
    run,
    setRun,
    selectRun,
    review,
    setReview,
    busy,
    error,
    hasConnection,
    activeProviders,
    pendingRun,
    preview,
    launch,
    refresh,
  };
}
