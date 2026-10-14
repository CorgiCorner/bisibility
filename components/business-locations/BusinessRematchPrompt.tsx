"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { BusinessActionStatus } from "./BusinessActionStatus";
import type {
  BusinessCommandPort,
  BusinessReadPermissions,
  BusinessTranslator,
  RematchLocationCommand,
} from "./contracts";
import { confirmedPromptSchema } from "./prompt-form";
import { type CommandWithoutKey, useBusinessCommand } from "./use-business-command";

export type RematchSummary = Readonly<{ decisionCount: number }>;
export function BusinessRematchPrompt({
  selection,
  identityActive,
  evidenceAvailable,
  permissions,
  translate: t,
  rematch,
  onSaved,
  onRequestCurrent,
  onCancel,
  onFocusReturn,
}: {
  selection: CommandWithoutKey<RematchLocationCommand>;
  identityActive: boolean;
  evidenceAvailable: boolean;
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
  rematch: BusinessCommandPort<RematchLocationCommand, RematchSummary>;
  onSaved: (result: RematchSummary) => void;
  onRequestCurrent?: () => void;
  onCancel: () => void;
  onFocusReturn: () => void;
}) {
  const id = useId();
  const [base] = useState(() => structuredClone(selection));
  const action = useBusinessCommand(rematch, (command, idempotencyKey) => ({
    ...command,
    idempotencyKey,
  }));
  const form = useForm<{ confirmed: boolean }>({
    defaultValues: { confirmed: false },
    resolver: zodResolver(confirmedPromptSchema),
  });
  const same = JSON.stringify(base) === JSON.stringify(selection);
  const valid =
    base.expectedDecisions.length > 0 &&
    base.expectedDecisions.length <= 256 &&
    new Set(base.expectedDecisions.map((item) => item.itemId)).size ===
      base.expectedDecisions.length;
  const writable =
    permissions.canWrite === true && identityActive && evidenceAvailable && same && valid;
  const conflict = !same || action.result?.kind === "conflict";
  if (permissions.canRead !== true) return null;
  return (
    <Card component="section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="font-semibold">
        {t("rematch")}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">{t("rematchHelp")}</p>
      {!evidenceAvailable ? (
        <p className="mt-2 text-sm text-fg-muted">{t("missingRetainedEvidence")}</p>
      ) : null}
      <form
        className="mt-4"
        onSubmit={form.handleSubmit(async () => {
          if (!writable || action.pending || conflict) return;
          const result = await action.submit(base);
          if (result?.kind === "saved") {
            form.reset({ confirmed: false });
            onSaved(result.value);
          }
        })}
      >
        <Checkbox
          {...form.register("confirmed")}
          aria-invalid={Boolean(form.formState.errors.confirmed)}
          aria-describedby={form.formState.errors.confirmed ? `${id}-confirmed-error` : undefined}
          label={t("rematchConfirmation")}
          disabled={!writable || action.pending}
        />
        {form.formState.errors.confirmed ? (
          <p className="mt-2 text-sm text-red-text">{t("validation.confirmed")}</p>
        ) : null}
        <BusinessActionStatus
          result={
            conflict && action.result?.kind !== "conflict"
              ? { kind: "conflict", current: null }
              : action.result
          }
          pending={action.pending}
          translate={t}
        />
        {conflict && onRequestCurrent ? (
          <Button variant="outline" className="mt-3" onClick={onRequestCurrent}>
            {t("reviewCurrent")}
          </Button>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" disabled={!writable || action.pending || conflict}>
            {t("confirmRematch")}
          </Button>
          <Button
            variant="ghost"
            disabled={action.pending}
            onClick={() => {
              onCancel();
              onFocusReturn();
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
