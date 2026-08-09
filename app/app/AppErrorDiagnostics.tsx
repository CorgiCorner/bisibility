"use client";

import { Button, MonoText } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import {
  CaretRightIcon as CaretRight,
  CheckIcon as Check,
  CopyIcon as Copy,
} from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";

export type AppErrorDetails = {
  digest?: string;
  message: string;
  name: string;
  occurredAt: string;
  pathname: string;
  stack?: string;
};

const COPY_RESET_MS = 1600;

/** Everything a support issue needs, as one clipboard block. */
export function formatAppErrorReport(details: AppErrorDetails) {
  return [
    `reference: ${details.digest ?? "none"}`,
    `error: ${details.name}: ${details.message}`,
    `view: ${details.pathname}`,
    `time: ${details.occurredAt}`,
    "",
    details.stack ?? "(no stack trace captured)",
  ].join("\n");
}

export type AppErrorDiagnosticsProps = {
  details: AppErrorDetails;
};

/** Collapsible reference row with the raw trace on demand. */
export function AppErrorDiagnostics({ details }: Readonly<AppErrorDiagnosticsProps>) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  // Keep the copied-state reset timer deduped across rapid clicks.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  function handleCopy() {
    void navigator.clipboard?.writeText(formatAppErrorReport(details));
    setCopied(true);
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
  }

  return (
    <div className="mt-[26px] w-full max-w-[520px] overflow-hidden rounded-xl border border-border bg-bg-elev text-left">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="flex w-full items-center gap-[9px] px-3.5 py-[11px] text-left transition-colors hover:bg-bg"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <CaretRight
          aria-hidden
          className={cn(
            "flex-none text-fg-muted transition-transform duration-150",
            open && "rotate-90",
          )}
          size={13}
          weight="bold"
        />
        <MonoText
          className="flex-none font-semibold tracking-[0.4px]"
          component="span"
          size="sm"
          sx={{ color: "var(--fg)" }}
        >
          {details.digest ?? "no reference"}
        </MonoText>
        <MonoText className="truncate" component="span" muted size="sm" suppressHydrationWarning>
          {details.name} · {details.occurredAt}
        </MonoText>
        <span className="ml-auto flex-none text-[11.5px] font-semibold text-fg-muted">
          {open ? "Hide trace" : "Show trace"}
        </span>
      </button>

      <div className="border-t border-border bg-code-bg" hidden={!open} id={panelId}>
        <div
          className="flex items-center justify-between gap-3 border-b py-2 pl-3.5 pr-2.5"
          style={{ borderColor: "var(--code-border)" }}
        >
          <MonoText
            className="uppercase tracking-[1.2px]"
            component="span"
            size="sm"
            sx={{ color: "var(--code-faint)", fontSize: "11.5px" }}
          >
            Stack trace
          </MonoText>
          <Button
            onClick={handleCopy}
            size="sm"
            startIcon={copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
            sx={{
              // Darker inset on the trace panel; the code-* tokens carry the
              // dark surface in both themes, so mix toward black rather than --bg.
              backgroundColor: "color-mix(in srgb, var(--code-bg) 82%, #000)",
              borderColor: "var(--code-border)",
              color: "var(--code-faint)",
              fontSize: "11px",
              minHeight: 26,
              padding: "0 9px",
              "&:hover": {
                backgroundColor: "color-mix(in srgb, var(--code-bg) 82%, #000)",
                borderColor: "var(--border-strong)",
                color: "var(--code-fg)",
              },
            }}
            type="button"
            variant="secondary"
          >
            {copied ? "Copied" : "Copy details"}
          </Button>
        </div>
        <pre className="m-0 whitespace-pre-wrap break-words px-3.5 pb-3.5 pt-3 font-mono text-[11px] leading-[1.7] text-code-fg">
          {details.stack ?? `${details.name}: ${details.message}`}
        </pre>
      </div>
    </div>
  );
}
