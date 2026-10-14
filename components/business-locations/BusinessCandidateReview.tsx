"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { BusinessActionStatus } from "./BusinessActionStatus";
import { BusinessMatchProvenance } from "./BusinessMatchProvenance";
import type {
  BusinessCommandPort,
  BusinessReadPermissions,
  BusinessTranslator,
  MatchSummary,
  ReviewMatchCommand,
} from "./contracts";
import { isReviewableCandidate } from "./presentation";
import { candidatePromptSchema } from "./prompt-form";
import { useBusinessCommand } from "./use-business-command";

export function BusinessCandidateReview({
  projectId,
  decision,
  identityActive,
  permissions,
  translate: t,
  formatDate,
  review,
  onSaved,
  onRequestCurrent,
  onCancel,
  onFocusReturn,
}: {
  projectId: string;
  decision: MatchSummary;
  identityActive: boolean;
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
  formatDate: (iso: string) => string;
  review: BusinessCommandPort<ReviewMatchCommand, MatchSummary>;
  onSaved: (match: MatchSummary) => void;
  onRequestCurrent?: () => void;
  onCancel: () => void;
  onFocusReturn: () => void;
}) {
  const id = useId();
  const [base, setBase] = useState({ projectId, decision });
  const action = useBusinessCommand(review, (command, idempotencyKey) => ({
    ...command,
    idempotencyKey,
  }));
  const form = useForm<{ reason: string; action: "confirm" | "reject"; confirmed: boolean }>({
    defaultValues: {
      reason: "",
      action: isReviewableCandidate(decision) ? "confirm" : "reject",
      confirmed: false,
    },
    resolver: zodResolver(candidatePromptSchema),
  });
  const sameItem =
    projectId === base.projectId &&
    decision.locationId === base.decision.locationId &&
    decision.observationRunId === base.decision.observationRunId &&
    decision.itemId === base.decision.itemId;
  const changed =
    decision.decisionId !== base.decision.decisionId ||
    decision.decisionRevision > base.decision.decisionRevision ||
    decision.identityRevisionId !== base.decision.identityRevisionId;
  const conflict = changed || action.result?.kind === "conflict";
  const current =
    action.result?.kind === "conflict" ? (action.result.current ?? decision) : decision;
  const confirmAllowed =
    isReviewableCandidate(base.decision) &&
    Boolean(base.decision.locationName) &&
    Boolean(base.decision.itemName || base.decision.itemDomain);
  const writable = permissions.canWrite === true && identityActive && sameItem;
  if (permissions.canRead !== true) return null;
  if (!sameItem)
    return (
      <Card>
        <p>{t("selectionChanged")}</p>
      </Card>
    );
  return (
    <Card component="section" aria-labelledby={`${id}-title`} className="min-w-0">
      <h2 id={`${id}-title`} className="font-semibold">
        {t("reviewCandidate")}
      </h2>
      <p className="mt-2 text-sm">
        {t("candidateBranch", { name: base.decision.locationName ?? t("notProvided") })}
      </p>
      {base.decision.locationAddress ? (
        <p className="mt-1 text-sm text-fg-muted">{base.decision.locationAddress}</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt>{t("candidateItem")}</dt>
        <dd className="min-w-0 break-words">{base.decision.itemName ?? t("notProvided")}</dd>
        <dt>{t("candidateDomain")}</dt>
        <dd className="min-w-0 break-words">{base.decision.itemDomain ?? t("notProvided")}</dd>
        <dt>{t("surface")}</dt>
        <dd className="min-w-0 break-words">{t(`surfaces.${base.decision.surface}`)}</dd>
        <dt>{t("matchStatus")}</dt>
        <dd className="min-w-0 break-words">{t(`matchStates.${base.decision.status}`)}</dd>
        <dt>{t("matchReason")}</dt>
        <dd className="min-w-0 break-words">{t(`reasons.${base.decision.reason}`)}</dd>
        <dt>{t("observedAt")}</dt>
        <dd className="min-w-0 break-words">{formatDate(base.decision.observedAt)}</dd>
        <BusinessMatchProvenance decision={base.decision} translate={t} formatDate={formatDate} />
        <dt>{t("promotion")}</dt>
        <dd className="min-w-0 break-words">{t(`promotions.${base.decision.promotion}`)}</dd>
        <dt>{t("sourceSlot")}</dt>
        <dd className="min-w-0 break-words">
          {base.decision.originalOrdinals.slot ?? t("notProvided")}
        </dd>
        <dt>{t("sourcePage")}</dt>
        <dd className="min-w-0 break-words">
          {base.decision.originalOrdinals.page ?? t("notProvided")}
        </dd>
        <dt>{t("sourceOrdinal")}</dt>
        <dd className="min-w-0 break-words">{base.decision.sourceOrdinal ?? t("notProvided")}</dd>
      </dl>
      {!confirmAllowed ? (
        <p className="mt-3 text-sm text-fg-muted">{t("confirmationBlocked")}</p>
      ) : null}
      <p className="mt-3 text-sm text-fg-muted">{t("reviewOnlyThisItem")}</p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={form.handleSubmit(async (values) => {
          if (
            !writable ||
            conflict ||
            action.pending ||
            (values.action === "confirm" && !confirmAllowed)
          )
            return;
          const match = base.decision;
          const result = await action.submit({
            projectId: base.projectId,
            locationId: match.locationId,
            identityRevisionId: match.identityRevisionId,
            observationRunId: match.observationRunId,
            itemId: match.itemId,
            decisionId: match.decisionId,
            expectedDecisionRevision: match.decisionRevision,
            action: values.action,
            reason: values.reason,
          });
          if (result?.kind === "saved") {
            setBase({ projectId: base.projectId, decision: result.value });
            form.reset({ reason: "", action: "reject", confirmed: false });
            onSaved(result.value);
          }
        })}
      >
        <MenuSelect
          ariaLabel={t("reviewAction")}
          value={form.watch("action")}
          disabled={!writable || action.pending}
          options={[
            { value: "confirm", label: t("confirmCandidate"), disabled: !confirmAllowed },
            { value: "reject", label: t("rejectCandidate") },
          ]}
          onChange={(value) => {
            if (value === "confirm" || value === "reject") {
              form.setValue("action", value);
              form.setValue("confirmed", false);
            }
          }}
        />
        <label htmlFor={`${id}-reason`} className="text-sm font-medium">
          {t("fields.reason")}
        </label>
        <Input
          id={`${id}-reason`}
          {...form.register("reason")}
          disabled={!writable || action.pending}
          aria-invalid={Boolean(form.formState.errors.reason)}
          aria-describedby={form.formState.errors.reason ? `${id}-reason-error` : undefined}
        />
        {form.formState.errors.reason ? (
          <p id={`${id}-reason-error`} role="alert" className="text-sm text-red-text">
            {t("validation.reason")}
          </p>
        ) : null}
        <Checkbox
          {...form.register("confirmed")}
          aria-invalid={Boolean(form.formState.errors.confirmed)}
          aria-describedby={form.formState.errors.confirmed ? `${id}-confirmed-error` : undefined}
          label={t("candidateConfirmation")}
          disabled={!writable || action.pending}
        />
        {form.formState.errors.confirmed ? (
          <p id={`${id}-confirmed-error`} role="alert" className="text-sm text-red-text">
            {t("validation.confirmed")}
          </p>
        ) : null}
        <BusinessActionStatus
          result={
            changed && action.result?.kind !== "conflict"
              ? { kind: "conflict", current: null }
              : action.result
          }
          pending={action.pending}
          translate={t}
        />
        {conflict ? (
          <div>
            <p className="text-sm text-fg-muted">{t("candidateConflictHelp")}</p>
            {current &&
            current.locationId === base.decision.locationId &&
            current.observationRunId === base.decision.observationRunId &&
            current.itemId === base.decision.itemId &&
            current.decisionRevision > base.decision.decisionRevision ? (
              <Button
                variant="outline"
                disabled={!writable}
                onClick={() => {
                  setBase({ projectId: base.projectId, decision: current });
                  form.setValue("confirmed", false);
                  form.setValue("action", isReviewableCandidate(current) ? "confirm" : "reject");
                  action.clearResult();
                }}
              >
                {t("reviewLatestDecision")}
              </Button>
            ) : onRequestCurrent ? (
              <Button variant="outline" onClick={onRequestCurrent}>
                {t("reviewCurrent")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={
              !writable ||
              action.pending ||
              conflict ||
              (form.watch("action") === "confirm" && !confirmAllowed)
            }
          >
            {t("saveReview")}
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
