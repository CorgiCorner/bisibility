"use client";

import { CopyButton } from "@/components/ui";
import { buildCreateKeywordsCurlSnippet, HOSTED_EU_API_BASE_URL } from "@/lib/api/snippets";
import { useSyncExternalStore } from "react";

type AddKeywordApiPanelProps = {
  projectId: string;
};

// Copy button styled for the dark code surface, matching DxQuickstart.
const codeDarkCopy = {
  color: "var(--code-faint)",
  "&:hover": {
    backgroundColor: "color-mix(in srgb, var(--code-fg) 8%, transparent)",
    color: "var(--code-fg)",
  },
};

function browserApiBaseUrl() {
  return typeof window === "undefined"
    ? HOSTED_EU_API_BASE_URL
    : `${window.location.origin}/api/v1`;
}

function subscribeApiBaseUrl(onStoreChange: () => void) {
  if (typeof window !== "undefined") queueMicrotask(onStoreChange);
  return () => undefined;
}

function curlSnippet(projectId: string, apiBaseUrl: string) {
  return buildCreateKeywordsCurlSnippet(projectId, "$BISIBILITY_API_KEY", apiBaseUrl);
}

export function AddKeywordApiPanel({ projectId }: Readonly<AddKeywordApiPanelProps>) {
  const apiBaseUrl = useSyncExternalStore(
    subscribeApiBaseUrl,
    browserApiBaseUrl,
    () => HOSTED_EU_API_BASE_URL,
  );
  const snippet = curlSnippet(projectId, apiBaseUrl);

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-[12.5px] text-fg-muted">
        Batch-add keywords from your own scripts or CI. Authenticate with a project API key stored
        as <code className="font-mono text-[11.5px] text-fg">$BISIBILITY_API_KEY</code>.
      </p>
      <div className="min-w-0 overflow-hidden rounded-[11px] border border-border bg-code-bg">
        <div className="flex items-center justify-between gap-2 border-b border-border-soft px-3 pt-2">
          <div
            className="rounded-t-lg px-3 py-1.5 font-mono text-[11.5px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--code-bg) 92%, var(--code-fg))",
              color: "var(--code-fg)",
            }}
          >
            curl
          </div>
          <CopyButton label="Copy curl snippet" size="sm" sx={codeDarkCopy} text={snippet} />
        </div>
        <pre className="m-0 overflow-x-auto px-4 py-3.5 font-mono text-[11.5px] leading-[1.75] text-code-fg">
          {snippet}
        </pre>
      </div>
      <p className="m-0 text-[11.5px] text-fg-faint">
        Full API reference at{" "}
        <code className="font-mono text-fg-muted">{apiBaseUrl}/openapi.json</code>.
      </p>
    </div>
  );
}
