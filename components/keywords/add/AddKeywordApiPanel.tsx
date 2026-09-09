"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import {
  API_KEY_PLACEHOLDER,
  buildCreateKeywordsCurlSnippet,
  HOSTED_EU_API_BASE_URL,
  tokenizeCurlSnippet,
} from "@/lib/api/snippets";
import { docsLinkProps } from "@/lib/site/site";
import { useSyncExternalStore } from "react";

type AddKeywordApiPanelProps = {
  projectId: string;
};

const toneColor = {
  keyword: "var(--blue)",
  placeholder: "var(--accent)",
  string: "var(--green)",
} as const;

const codeDarkCopy = {
  "--control-color": "var(--code-faint)",
  "--control-hover-background-color": "color-mix(in srgb, var(--code-fg) 8%, transparent)",
  "--control-hover-color": "var(--code-fg)",
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

function HighlightedCurl({ snippet }: Readonly<{ snippet: string }>) {
  return (
    <pre className="m-0 overflow-x-auto px-4 py-3.5 font-mono text-[11.5px] leading-[1.75] text-code-fg">
      {tokenizeCurlSnippet(snippet).map((line, lineIndex) => (
        <div className="whitespace-pre" key={`curl-${lineIndex}`}>
          {line.map((token, tokenIndex) =>
            token.tone ? (
              <span key={`${token.text}-${tokenIndex}`} style={{ color: toneColor[token.tone] }}>
                {token.text}
              </span>
            ) : (
              token.text
            ),
          )}
        </div>
      ))}
    </pre>
  );
}

export function AddKeywordApiPanel({ projectId }: Readonly<AddKeywordApiPanelProps>) {
  const apiBaseUrl = useSyncExternalStore(
    subscribeApiBaseUrl,
    browserApiBaseUrl,
    () => HOSTED_EU_API_BASE_URL,
  );
  const snippet = buildCreateKeywordsCurlSnippet(projectId, API_KEY_PLACEHOLDER, apiBaseUrl);
  const openapiHref = `${apiBaseUrl}/openapi.json`;

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-[12px] leading-5 text-fg-muted">
        Each country, location and language combination belongs to a project market. The API creates
        missing markets within your project limit. Adding keywords to a paused market keeps it
        paused; existing keywords and rank history stay in their original markets.
      </p>
      <p className="m-0 text-[12.5px] text-fg-muted">
        Batch-add keywords from your own scripts or CI. Authenticate with a project API key.
      </p>
      <div className="min-w-0 overflow-hidden rounded-control border border-code-border bg-code-bg">
        <div className="flex items-center justify-between gap-2 border-b border-code-border px-3 pt-2">
          <div
            className="rounded-t-lg px-3 py-1.5 font-sans tabular-nums text-[11.5px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--code-bg) 92%, var(--code-fg))",
              color: "var(--code-fg)",
            }}
          >
            curl
          </div>
          <CopyButton label="Copy curl snippet" size="sm" style={codeDarkCopy} text={snippet} />
        </div>
        <HighlightedCurl snippet={snippet} />
      </div>
      <p className="m-0 text-[11.5px] text-fg-muted">
        Full API reference at{" "}
        <a
          className="font-sans tabular-nums text-accent-text hover:underline"
          {...docsLinkProps(openapiHref, { external: true })}
        >
          {openapiHref}
        </a>
        .
      </p>
    </div>
  );
}
