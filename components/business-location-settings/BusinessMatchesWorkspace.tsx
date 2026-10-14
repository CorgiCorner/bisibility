"use client";

import { BusinessCandidateReview } from "@/components/business-locations/BusinessCandidateReview";
import { BusinessRematchPrompt } from "@/components/business-locations/BusinessRematchPrompt";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  listBusinessObservationChoices,
  readBusinessReviewCurrent,
  rematchBusinessObservations,
  reviewBusinessMatch,
} from "@/lib/business-location-store/session-actions";
import type {
  BusinessObservationChoice,
  BusinessReadPermissions,
  BusinessReviewContext,
  BusinessTranslator,
  LocationSummary,
} from "@/lib/business-locations/ui-contracts";
import { useFormatter } from "next-intl";
import { useRef, useState } from "react";

export function BusinessMatchesWorkspace({
  projectId,
  location,
  permissions,
  translate: t,
}: {
  projectId: string;
  location: LocationSummary;
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
}) {
  const format = useFormatter();
  const [page, setPage] = useState<{
    choices: BusinessObservationChoice[];
    next: string | null;
  } | null>(null);
  const [context, setContext] = useState<BusinessReviewContext | null>(null);
  const [reviewedItem, setReviewedItem] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  async function read<T>(action: () => Promise<T>, save: (value: T) => void) {
    const current = ++sequence.current;
    setPending(true);
    setError(false);
    try {
      const value = await action();
      if (current === sequence.current) save(value);
    } catch {
      if (current === sequence.current) setError(true);
    } finally {
      if (current === sequence.current) setPending(false);
    }
  }
  function select(runId: string) {
    setContext(null);
    setReviewedItem(null);
    setRematching(false);
    return read(() => readBusinessReviewCurrent(projectId, location.publicId, runId), setContext);
  }
  function refresh() {
    if (context)
      return read(
        () =>
          readBusinessReviewCurrent(projectId, location.publicId, context.observationRunId, {
            cursor: context.cursor,
            mode: "refresh",
          }),
        setContext,
      );
  }
  function candidates(cursor: string | null) {
    if (!context || !cursor) return;
    setReviewedItem(null);
    setRematching(false);
    return read(
      () =>
        readBusinessReviewCurrent(projectId, location.publicId, context.observationRunId, {
          cursor,
        }),
      setContext,
    );
  }
  function close() {
    setReviewedItem(null);
    setRematching(false);
    panel.current?.focus();
  }
  if (permissions.canRead !== true) return null;
  const decision = context?.decisions.find((row) => row.itemId === reviewedItem);
  const identityActive =
    location.state === "active" && context?.identityRevisionId === location.identity.revisionId;
  return (
    <div className="space-y-5">
      <Card component="section">
        <h2 className="font-semibold">
          {t("retainedMatches")}: {location.identity.name}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">{t("chooseRetainedObservation")}</p>
        <Button
          variant="outline"
          className="mt-3"
          disabled={pending}
          onClick={() => void read(() => listBusinessObservationChoices(projectId, null), setPage)}
        >
          {t("readObservations")}
        </Button>
        {page ? (
          <>
            <ul className="mt-3 space-y-2">
              {page.choices.map((choice) => (
                <li key={choice.id}>
                  <Button variant="ghost" disabled={pending} onClick={() => void select(choice.id)}>
                    {choice.keyword ?? t("notProvided")} · {t(`surfaces.${choice.surface}`)} ·{" "}
                    {t("recordedAt")}:{" "}
                    {format.dateTime(new Date(choice.recordedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Button>
                </li>
              ))}
            </ul>
            {!page.choices.length ? (
              <p className="mt-3 text-sm text-fg-muted">{t("noRetainedObservations")}</p>
            ) : null}
            {page.next ? (
              <Button
                variant="outline"
                disabled={pending}
                className="mt-3"
                onClick={() =>
                  void read(() => listBusinessObservationChoices(projectId, page.next), setPage)
                }
              >
                {t("nextScopes")}
              </Button>
            ) : null}
          </>
        ) : null}
        {pending ? (
          <p role="status" className="mt-3 text-sm">
            {t("loading")}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-text">
            {t("readError")}
          </p>
        ) : null}
      </Card>
      {context ? (
        <Card component="section">
          <div ref={panel} tabIndex={-1}>
            <p className="text-sm text-fg-muted">
              {t("retainedBatch", {
                included: format.number(context.includedCount),
                total: format.number(context.eligibleTotal),
              })}
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              {t("reviewSnapshotAt")}:{" "}
              {format.dateTime(new Date(context.watermark), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {context.previousCursor ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void candidates(context.previousCursor)}
                >
                  {t("previousCandidates")}
                </Button>
              ) : null}
              {context.nextCursor ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void candidates(context.nextCursor)}
                >
                  {t("nextCandidates")}
                </Button>
              ) : null}
            </div>
            {!context.evidenceAvailable ? (
              <p className="mt-2 text-sm text-fg-muted">{t("missingRetainedEvidence")}</p>
            ) : null}
            {context.decisions.length ? (
              <ul className="mt-3 space-y-2">
                {context.decisions.map((row) => (
                  <li key={row.itemId}>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setReviewedItem(row.itemId);
                        setRematching(false);
                      }}
                    >
                      {row.itemName ?? row.itemDomain ?? t("notProvided")} ·{" "}
                      {t(`matchStates.${row.status}`)}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-fg-muted">{t("noMatchDecisions")}</p>
            )}
            {permissions.canWrite ? (
              <Button
                variant="outline"
                className="mt-3"
                disabled={
                  pending ||
                  !identityActive ||
                  !context.evidenceAvailable ||
                  !context.expectedDecisions.length
                }
                onClick={() => {
                  setRematching(true);
                  setReviewedItem(null);
                }}
              >
                {t("rematch")}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
      {decision && context ? (
        <BusinessCandidateReview
          key={`${context.observationRunId}:${decision.itemId}`}
          projectId={projectId}
          decision={decision}
          identityActive={Boolean(
            identityActive && decision.identityRevisionId === location.identity.revisionId,
          )}
          permissions={permissions}
          translate={t}
          formatDate={(iso) =>
            format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" })
          }
          review={reviewBusinessMatch}
          onSaved={() => {
            close();
            void refresh();
          }}
          onRequestCurrent={() => void refresh()}
          onCancel={close}
          onFocusReturn={() => panel.current?.focus()}
        />
      ) : null}
      {rematching && context ? (
        <BusinessRematchPrompt
          key={context.observationRunId}
          selection={{
            projectId,
            locationId: location.publicId,
            identityRevisionId: context.identityRevisionId,
            observationRunId: context.observationRunId,
            expectedDecisions: [...context.expectedDecisions],
          }}
          identityActive={Boolean(identityActive)}
          evidenceAvailable={context.evidenceAvailable}
          permissions={permissions}
          translate={t}
          rematch={rematchBusinessObservations}
          onSaved={() => {
            close();
            void refresh();
          }}
          onRequestCurrent={() => void refresh()}
          onCancel={close}
          onFocusReturn={() => panel.current?.focus()}
        />
      ) : null}
    </div>
  );
}
