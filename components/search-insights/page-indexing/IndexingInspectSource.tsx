"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { LoadUrlsAction, StoredSitemap } from "@/lib/search-index/ui-model";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

export function IndexingInspectSource({
  projectId,
  sitemaps,
  loadUrlsAction,
  disabled,
  onUrls,
  onLoading,
}: Readonly<{
  projectId: string;
  sitemaps: StoredSitemap[];
  loadUrlsAction: LoadUrlsAction;
  disabled: boolean;
  onUrls: (urls: string[]) => void;
  onLoading: (loading: boolean) => void;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const [mode, setMode] = useState<"manual" | "sitemap">("manual");
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const sequence = useRef(0);
  const attach = useCallback(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  async function select(path: string) {
    const request = ++sequence.current;
    setSelected(path);
    setState("loading");
    onUrls([]);
    onLoading(true);
    try {
      const first = await loadUrlsAction({
        projectId,
        query: { sitemap: path, group: "not_checked", limit: 10 },
      });
      let urls = [...new Set(first.data.map((row) => row.url))].slice(0, 10);
      if (request !== sequence.current) return;
      if (urls.length < 10) {
        const remaining = await loadUrlsAction({ projectId, query: { sitemap: path, limit: 10 } });
        urls = [...new Set([...urls, ...remaining.data.map((row) => row.url)])].slice(0, 10);
      }
      if (request !== sequence.current) return;
      onUrls(urls);
      setState(urls.length ? "idle" : "empty");
    } catch {
      if (request === sequence.current) setState("error");
    } finally {
      if (request === sequence.current) onLoading(false);
    }
  }
  return (
    <div ref={attach} className="grid min-w-0 gap-3">
      <SegmentedControl
        ariaLabel={t("inspectSource")}
        className="m-0 shrink-0"
        fitContent
        size="toolbar"
        value={mode}
        disabled={disabled}
        options={[
          { value: "manual", label: t("inspectManual") },
          { value: "sitemap", label: t("inspectFromSitemap") },
        ]}
        onChange={(next) => {
          sequence.current += 1;
          onLoading(false);
          setState("idle");
          setSelected("");
          setMode(next);
          if (next === "sitemap") onUrls([]);
        }}
      />
      {mode === "sitemap" ? (
        <>
          <MenuSelect
            ariaLabel={t("sitemap")}
            value={selected}
            emptyMessage={t("inspectSelectSitemap")}
            size="input"
            disabled={disabled || !sitemaps.length}
            searchable
            options={sitemaps.map(({ id }) => ({ value: id, label: id }))}
            onChange={(path) => {
              void select(path);
            }}
          />
          <p className="m-0 text-ui-caption text-fg-muted">
            {t(sitemaps.length ? "inspectSitemapHint" : "inspectNoSitemaps")}
          </p>
          {state === "loading" ? (
            <p role="status" className="m-0 text-ui-caption text-fg-muted">
              {t("inspectSitemapLoading")}
            </p>
          ) : null}
          {state === "error" || state === "empty" ? (
            <p role="alert" className="m-0 text-ui-caption text-fg-muted">
              {t(state === "error" ? "loadFailed" : "inspectSitemapEmpty")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
