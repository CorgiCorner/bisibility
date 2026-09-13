"use client";

import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { findSettings, settingsSearchHref } from "./settings-search-index";

export function SettingsSearch({
  children,
  projectRef,
}: Readonly<{ children: ReactNode; projectRef: string }>) {
  const [query, setQuery] = useState("");
  const id = useId();
  const router = useRouter();
  const results = findSettings(query);
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
        label="Search settings"
        onChange={setQuery}
        onSubmit={openFirst}
        placeholder="Search settings..."
        value={query}
        variant="outlined"
      />
      {query.trim() ? (
        <>
          <p className="m-0 px-2 pb-2 text-[11px] text-fg-muted" role="status">
            {results.length
              ? `${results.length} setting${results.length === 1 ? "" : "s"} found`
              : "No settings found. Try timezone, API key or budget."}
          </p>
          <ul aria-label="Matching settings" className="m-0 flex list-none flex-col gap-1 p-0">
            {results.map((entry) => (
              <li key={entry.label}>
                <Link
                  className="block rounded-control px-2.5 py-2 text-[12px] no-underline hover:bg-bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
                  href={settingsSearchHref(projectRef, entry)}
                  onClick={() => setQuery("")}
                >
                  <span className="block font-semibold text-fg">{entry.label}</span>
                  <span className="mt-0.5 block text-[11px] text-fg-muted">{entry.section}</span>
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
