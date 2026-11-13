"use client";

import { RemoveNoteAction } from "@/components/timeline/RemoveNoteAction";
import { Card } from "@/components/ui/Card";
import type { AnnotationEntry } from "@/lib/annotations/types";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnnotationMarkerBadge } from "./AnnotationMarkerBadge";

type AnnotationDetailProps = {
  canDelete: boolean;
  entry: AnnotationEntry | null;
  projectId: string;
};

export function AnnotationDetail({ canDelete, entry, projectId }: Readonly<AnnotationDetailProps>) {
  const t = useTranslations("projectTimeline.annotations");
  if (!entry) {
    return (
      <Card>
        <p className="m-0 text-sm text-fg-muted">{t("empty")}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-fg-muted">
          <AnnotationMarkerBadge marker={entry.marker} />
          <span>
            {entry.sourceLabel}
            {entry.subtitle ? ` · ${entry.subtitle}` : ""}
          </span>
        </div>
        {canDelete && entry.removable ? (
          <RemoveNoteAction projectId={projectId} signalId={entry.id} />
        ) : null}
      </div>
      <h2 className="m-0 text-base font-semibold text-fg">{entry.title}</h2>
      {entry.range ? <p className="m-0 text-sm text-fg-muted">{entry.range}</p> : null}
      <p className="m-0 text-sm text-fg">{entry.detail}</p>
      {entry.href ? (
        <a className="text-sm text-accent-text underline" href={entry.href} rel="noreferrer">
          {entry.href}
        </a>
      ) : null}
    </Card>
  );
}

export function AnnotationSourceRow({
  detail,
  href,
  hrefLabel,
  marker,
  status,
  title,
}: Readonly<{
  detail: string;
  href?: string;
  hrefLabel?: string;
  marker: "C" | "D" | "G" | "S";
  status?: string;
  title: string;
}>) {
  return (
    <div className="flex items-center gap-3">
      <AnnotationMarkerBadge marker={marker} />
      <span className="min-w-0 flex-1">
        <span className="block text-ui-body font-semibold text-fg">{title}</span>
        <span className="block text-ui-caption text-fg-muted">{detail}</span>
      </span>
      {status ? <span className="text-ui-caption text-green-text">{status}</span> : null}
      {href && hrefLabel ? (
        <Link className="text-ui-caption text-accent-text underline" href={href}>
          {hrefLabel}
        </Link>
      ) : null}
    </div>
  );
}
