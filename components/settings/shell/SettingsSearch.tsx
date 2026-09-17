"use client";

import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import { findSettings, settingsSearchHref } from "./settings-search-index";

export function SettingsSearch({
  children,
  projectRef,
}: Readonly<{ children: ReactNode; projectRef: string }>) {
  const [query, setQuery] = useState("");
  const id = useId();
  const router = useRouter();
  const t = useTranslations("projectSettingsShell");
  const results = findSettings(query, t);
  function openFirst() {
    if (!results[0]) return;
    router.push(settingsSearchHref(projectRef, results[0]));
    setQuery("");
  }
  return (
    <div className="min-w-0">
      <ToolbarSearch
        className="mb-3 w-full"
        id={`settings-search-${id}`}
        label={t("search.label")}
        onChange={setQuery}
        onSubmit={openFirst}
        placeholder={t("search.placeholder")}
        value={query}
        variant="outlined"
      />
      {query.trim() ? (
        <>
          <p className="m-0 px-2 pb-2 text-[11px] text-fg-muted" role="status">
            {results.length ? t("search.results", { count: results.length }) : t("search.empty")}
          </p>
          <ul
            aria-label={t("search.resultsLabel")}
            className="m-0 flex list-none flex-col gap-1 p-0"
          >
            {results.map((entry) => (
              <li key={settingsSearchHref(projectRef, entry)}>
                <Link
                  className="block rounded-control px-2.5 py-2 text-[12px] no-underline hover:bg-bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
                  href={settingsSearchHref(projectRef, entry)}
                  onClick={() => setQuery("")}
                >
                  <span className="block font-semibold text-fg">{entry.label(t)}</span>
                  <span className="mt-0.5 block text-[11px] text-fg-muted">{entry.section(t)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        children
      )}
    </div>
  );
}
