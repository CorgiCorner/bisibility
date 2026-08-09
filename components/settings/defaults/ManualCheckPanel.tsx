"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, MonoText } from "@/components/ui";
import { runManualProjectCheck } from "@/lib/actions/settings";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowClockwiseIcon as ArrowClockwise,
  HandPointingIcon as HandPointing,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type ManualCheckPanelProps = {
  projectId?: string;
  runCheck?: (input: { projectId: string }) => Promise<unknown>;
};

type ManualCheckResult = {
  failed?: number;
  queued?: number;
  reason?: "budget_exhausted";
  total?: number;
};
type PanelMessage = { text: string; tone: "default" | "error" };

function checkMessage(result: ManualCheckResult): PanelMessage {
  const failed = result.failed ?? 0;
  const queued = result.queued ?? 0;
  const total = result.total ?? queued + failed;
  if (total === 0) {
    return { text: "No keywords to check yet.", tone: "default" };
  }

  const checkLabel = total === 1 ? "check" : "checks";
  const text = `Started ${queued} of ${total} ${checkLabel}.`;
  if (result.reason === "budget_exhausted") {
    return {
      text: `Monthly rank check budget reached. ${text} ${failed} could not be started.`,
      tone: "error",
    };
  }
  if (failed === 0) {
    return { text, tone: "default" };
  }

  const failedLabel = failed === 1 ? "check" : "checks";
  return {
    text: `${text} ${failed} ${failedLabel} could not be started.`,
    tone: "error",
  };
}

function messageClass(tone: PanelMessage["tone"]) {
  return `mt-3 text-[11.5px] font-medium ${tone === "error" ? "text-red-text" : "text-fg-muted"}`;
}

function messageRole(tone: PanelMessage["tone"]) {
  return tone === "error" ? "alert" : "status";
}

export function ManualCheckPanel({ projectId, runCheck }: Readonly<ManualCheckPanelProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const { readOnly } = useProjectWriteMode();

  function onRunCheck() {
    if (!projectId || readOnly) {
      return;
    }

    setMessage(null);
    startTransition(() => {
      void (runCheck ?? runManualProjectCheck)({ projectId })
        .then((result) => {
          setMessage(checkMessage(result as ManualCheckResult));
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage({
            text: actionErrorMessage(error, "Check could not be started."),
            tone: "error",
          }),
        );
    });
  }

  return (
    <div className="rounded-[14px] border border-border bg-bg-elev p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold">
        <HandPointing className="text-accent-text" size={16} weight="fill" />
        Manual checks only
      </div>
      <p className="mt-1.5 text-[12.5px] leading-5 text-fg-muted">
        No automatic rank checks will be scheduled. Use "Run check now" when you want fresh
        rankings. Alert rules are evaluated only after manual checks.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-6 border-t border-border-soft pt-4">
        <Metric label="Next check" value={readOnly ? "Paused - migration hold" : "Not scheduled"} />
        <Metric label="Scheduled usage" value="0 checks / day" />
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly || !projectId}
            loading={isPending}
            loadingLabel="Running"
            onClick={onRunCheck}
            startIcon={<ArrowClockwise size={15} weight="bold" />}
            sx={{ marginLeft: "auto" }}
            type="button"
            variant="primary"
          >
            Run check now
          </Button>
        </ProjectReadOnlyTooltip>
      </div>
      {message ? (
        <p className={messageClass(message.tone)} role={messageRole(message.tone)}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <MonoText className="uppercase tracking-[0.5px]" muted>
        {label}
      </MonoText>
      <div className="mt-1 text-[13.5px] font-semibold text-fg">{value}</div>
    </div>
  );
}
