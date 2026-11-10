"use client";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTranslations } from "next-intl";
import { useState } from "react";
export type PreviewOpsResult =
  | {
      status:
        | "delivered"
        | "not_configured"
        | "delivery_failed"
        | "rate_limited"
        | "failed"
        | "forbidden";
    }
  | { status: "completed"; attempted: number; delivered: number };
function opsResultText(
  result: PreviewOpsResult,
  t: ReturnType<typeof useTranslations<"instanceAdmin.opsActions">>,
  kind: "send" | "sweep",
): string {
  switch (result.status) {
    case "delivered":
      return t("delivered");
    case "not_configured":
      return t("notConfigured");
    case "delivery_failed":
      return t("deliveryFailed");
    case "rate_limited":
      return t("rateLimited");
    case "failed":
      return t(kind === "sweep" ? "sweepFailed" : "temporarilyUnavailable");
    case "forbidden":
      return t("forbidden");
    case "completed":
      return t("sweepCompleted", { attempted: result.attempted, delivered: result.delivered });
  }
}
export function OssOpsActions({
  onSendTest,
  onRunSweep,
  slackConfigured = true,
}: {
  slackConfigured?: boolean;
  onSendTest: () => PreviewOpsResult | void | Promise<PreviewOpsResult | void>;
  onRunSweep: () => PreviewOpsResult | void | Promise<PreviewOpsResult | void>;
}) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"send" | "sweep" | null>(null);
  const t = useTranslations("instanceAdmin.controls");
  const messages = useTranslations("instanceAdmin.opsActions");
  async function run(kind: "send" | "sweep", action: typeof onSendTest) {
    setBusy(kind);
    try {
      const result = await action();
      setNotice(
        result ? opsResultText(result, messages, kind) : messages("temporarilyUnavailable"),
      );
    } catch {
      setNotice(messages("failed"));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null || !slackConfigured}
          onClick={() => void run("send", onSendTest)}
        >
          {busy === "send" ? t("sending") : t("sendTestNotification")}
        </Button>
        <Tooltip content={messages("sweepHelp")} semantics="description">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null || !slackConfigured}
            onClick={() => void run("sweep", onRunSweep)}
          >
            {busy === "sweep" ? t("running") : t("runOutboxSweep")}
          </Button>
        </Tooltip>
      </div>
      {(notice || !slackConfigured) && (
        <p role="status" className="mt-2 text-xs text-fg-muted">
          {!slackConfigured ? messages("notConfigured") : notice}
        </p>
      )}
    </div>
  );
}
