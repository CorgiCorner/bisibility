"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { readBusinessIdentityVersions } from "@/lib/business-location-store/session-actions";
import type {
  BusinessTranslator,
  IdentityHistorySummary,
  LocationSummary,
} from "@/lib/business-locations/ui-contracts";
import { useFormatter } from "next-intl";
import { useState } from "react";

export function BusinessIdentityHistory({
  projectId,
  location,
  translate: t,
}: {
  projectId: string;
  location: LocationSummary;
  translate: BusinessTranslator;
}) {
  const format = useFormatter();
  const [page, setPage] = useState<{ rows: IdentityHistorySummary[]; next: number | null } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function read(after: number) {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      setPage(await readBusinessIdentityVersions(projectId, location.publicId, after));
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <Card component="section">
      <h2 className="font-semibold">
        {t("identityHistory")}: {location.identity.name}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">{t("identityHistoryHelp")}</p>
      <Button variant="outline" className="mt-3" disabled={pending} onClick={() => void read(0)}>
        {t("readIdentityHistory")}
      </Button>
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
      {page ? (
        <>
          <ol className="mt-3 space-y-3">
            {page.rows.map((row) => (
              <li
                key={row.identity.revisionId}
                className="rounded-control border border-border p-3 text-sm"
              >
                <p className="font-medium">
                  {t("identityRevision", { revision: String(row.identity.revision) })}:{" "}
                  {row.identity.name}
                </p>
                <p className="mt-1 text-fg-muted">
                  {t("identityEffectiveFrom")}:{" "}
                  {format.dateTime(new Date(row.effectiveFrom), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                {row.identity.address ? <p className="mt-1">{row.identity.address}</p> : null}
                {row.identity.domain ? (
                  <p className="mt-1 break-all">{row.identity.domain}</p>
                ) : null}
                <ul className="mt-1">
                  {row.identity.identifiers.map((identifier) => (
                    <li key={`${identifier.type}:${identifier.value}`} className="break-all">
                      {identifier.type === "cid" ? t("fields.cid") : t("fields.placeId")}:{" "}
                      {identifier.value}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 break-words">
                  {t("fields.reason")}: {row.reason}
                </p>
              </li>
            ))}
          </ol>
          {page.next !== null ? (
            <Button
              variant="outline"
              disabled={pending}
              className="mt-3"
              onClick={() => void read(page.next ?? 0)}
            >
              {t("nextScopes")}
            </Button>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
