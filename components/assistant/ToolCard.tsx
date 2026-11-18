"use client";

import { Button } from "@/components/ui/Button";
import { useLiveNow } from "@/components/ui/useLiveNow";
import type { ToolCallView } from "@/lib/assistant/wire";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

export function ToolCard({
  call,
  decide,
  disabled = false,
}: Readonly<{
  call: ToolCallView;
  disabled?: boolean;
  decide: (call: ToolCallView, decision: "approve" | "deny") => Promise<void>;
}>) {
  const t = useTranslations("assistant");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const lock = useRef(false);
  const now = useLiveNow(
    call.expiresAt ?? "1970-01-01T00:00:00Z",
    call.status === "proposed" && Boolean(call.expiresAt),
  );
  const seconds = call.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(call.expiresAt) - Date.parse(now)) / 1000))
    : null;
  const symbols: Record<ToolCallView["status"], string> = {
    proposed: "?",
    approved: "✓",
    running: "…",
    completed: "✓",
    failed: "!",
    denied: "×",
    expired: "◷",
    blocked: "⊘",
    unknown: "?",
  };
  async function submit(decision: "approve" | "deny") {
    if (lock.current || submitted) return;
    lock.current = true;
    setPending(true);
    try {
      await decide(call, decision);
      setSubmitted(true);
    } catch {
      // The parent displays the server error and refreshes the proposal.
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const resultLink = call.result?.link;
  const job = call.result?.job;
  const safeLink = (href: string) =>
    (href.startsWith("/") && !href.startsWith("//")) || /^https?:\/\//i.test(href);
  return (
    <section className="space-y-2 rounded-control bg-bg-sunken p-3 text-xs" aria-label={call.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{call.title}</strong>
        <span>
          {symbols[call.status]} {t(`statuses.${call.status}`)}
        </span>
      </div>
      <p>{call.summary}</p>
      <p>{t(`categories.${call.category}`)}</p>
      {call.target ? <p>{t("target", { target: call.target })}</p> : null}
      {call.argsPreview.map((arg, index) => (
        <p className="[overflow-wrap:anywhere]" key={`${arg.label}-${index}`}>
          <strong>{arg.label}:</strong> {arg.value}
        </p>
      ))}
      {call.estimatedCostCents !== null ? (
        <p>{t("estimated", { amount: `$${(call.estimatedCostCents / 100).toFixed(2)}` })}</p>
      ) : null}
      {call.maxCostCents !== null ? (
        <p>{t("maximum", { amount: `$${(call.maxCostCents / 100).toFixed(2)}` })}</p>
      ) : null}
      {call.toolFunding ? (
        <p>{t("toolFunding", { funding: call.toolFunding })}</p>
      ) : call.category === "paid" ? (
        <p>{t("toolFundingSeparate")}</p>
      ) : null}
      {seconds !== null && call.status === "proposed" ? (
        <p>{t("secondsRemaining", { seconds: String(seconds) })}</p>
      ) : null}
      {call.result ? (
        <p>
          {call.result.summary}{" "}
          {resultLink && safeLink(resultLink.href) ? (
            <a className="underline" href={resultLink.href} rel="noopener noreferrer">
              {resultLink.label}
            </a>
          ) : null}{" "}
          {job ? (
            job.href && safeLink(job.href) ? (
              <a className="underline" href={job.href}>
                {t("resultJob", { status: job.status })}
              </a>
            ) : (
              t("resultJob", { status: job.status })
            )
          ) : null}
        </p>
      ) : null}
      {call.error ? <p role="alert">{t(`errors.${call.error.code}`)}</p> : null}
      {call.status === "proposed" && call.argsHash ? (
        <div className="flex gap-2">
          <Button
            disabled={disabled || pending || submitted || seconds === 0}
            onClick={() => void submit("approve")}
            type="button"
          >
            {pending ? t("pendingDecision") : t("approve")}
          </Button>
          <Button
            disabled={disabled || pending || submitted || seconds === 0}
            onClick={() => void submit("deny")}
            type="button"
            variant="ghost"
          >
            {t("deny")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
