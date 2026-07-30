"use client";

import { CopyButton, IdChip, MonoText, Sheet } from "@/components/ui";
import type { AuditDiff, AuditEntry } from "@/lib/queries/audit";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { downloadAuditEntries } from "./audit-export";
import { OperationPill } from "./OperationPill";

export type AuditDetailSheetProps = {
  entry: AuditEntry | null;
  onClose: () => void;
};

function formatDiffValue(value: AuditDiff["before"]) {
  return value === null ? "null" : String(value);
}

function FieldLabel({ children }: Readonly<{ children: string }>) {
  return (
    <div className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-faint">
      {children}
    </div>
  );
}

function DetailField({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1.5 min-w-0">{children}</div>
    </div>
  );
}

function DiffRows({ diff }: Readonly<{ diff: readonly AuditDiff[] }>) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-border font-mono text-xs">
      {diff.map((item) => (
        <div className="border-border-soft border-b last:border-b-0" key={item.field}>
          {item.before !== null ? (
            <div className="flex gap-2 border-border-soft border-b px-[13px] py-2.5 [background:color-mix(in_srgb,var(--red)_7%,transparent)] last:border-b-0">
              <span className="shrink-0 text-red">-</span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-fg-muted">
                {item.field}: {formatDiffValue(item.before)}
              </span>
            </div>
          ) : null}
          {item.after !== null ? (
            <div className="flex gap-2 px-[13px] py-2.5 [background:color-mix(in_srgb,var(--green)_7%,transparent)]">
              <span className="shrink-0 text-green">+</span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-fg">
                {item.field}: {formatDiffValue(item.after)}
              </span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function UserAgentRow({ value }: Readonly<{ value: string }>) {
  const recorded = value !== "Not recorded";
  return (
    <div className="min-w-0 border-border-soft border-t pt-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-fg-faint">user_agent</span>
        {recorded ? <CopyButton label="Copy user agent" size="sm" text={value} /> : null}
      </div>
      <div className="mt-1.5 break-all whitespace-pre-wrap text-fg-muted">{value}</div>
    </div>
  );
}

function MetadataRow({
  copyable,
  label,
  value,
}: Readonly<{
  copyable?: boolean;
  label: string;
  value: string;
}>) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="shrink-0 text-fg-faint">{label}</span>
      {copyable ? (
        <IdChip className="min-w-0 max-w-full" size="sm" value={value} />
      ) : (
        <span className="min-w-0 truncate text-right text-fg-muted">{value}</span>
      )}
    </div>
  );
}

export function AuditDetailSheet({ entry, onClose }: Readonly<AuditDetailSheetProps>) {
  if (!entry) {
    return null;
  }

  return (
    <Sheet
      footer={
        <div className="flex items-center gap-2.5">
          <button
            className="min-h-10 shrink-0 rounded-[9px] px-3 text-[13px] font-semibold text-fg-muted outline-none transition-colors hover:bg-bg-sunken hover:text-fg"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[9px] bg-accent px-4 text-[13px] font-semibold text-code-fg hover:bg-accent-hover"
            onClick={() => downloadAuditEntries([entry], "json", entry.metadata.event_id)}
            type="button"
          >
            <DownloadSimple aria-hidden size={15} />
            Export entry (JSON)
          </button>
        </div>
      }
      onClose={onClose}
      open={Boolean(entry)}
      title={
        <span className="block min-w-0">
          <span className="block truncate">{entry.eventName}</span>
          <MonoText className="mt-1" component="span" muted size="lg">
            {entry.timestampLabel}
          </MonoText>
        </span>
      }
      widthVariant="form"
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <DetailField label="Actor">
            <div className="text-[13px] font-semibold text-fg">{entry.actor.name}</div>
            <MonoText className="mt-0.5" component="div" size="lg">
              {entry.actor.email}
            </MonoText>
            <IdChip className="mt-2" size="sm" value={entry.actor.id} />
          </DetailField>
          <DetailField label="Operation">
            <OperationPill operation={entry.operation} />
          </DetailField>
          <DetailField label="Resource">
            <div className="font-mono text-xs text-fg">{entry.resource.name}</div>
            {entry.resource.id ? (
              <IdChip className="mt-2" size="sm" value={entry.resource.id} />
            ) : null}
          </DetailField>
          <DetailField label="Source">
            <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-fg">
              <span>{entry.source.channel.toUpperCase()}</span>
              <span className="text-fg-faint">·</span>
              <span className="truncate">{entry.source.ip}</span>
              {entry.source.ip !== "Not recorded" ? (
                <CopyButton label="Copy IP" size="sm" text={entry.source.ip} />
              ) : null}
            </div>
          </DetailField>
        </div>
        {entry.statusReason ? (
          <div className="rounded-[11px] border border-red px-[15px] py-3 text-[12.5px] text-red">
            {entry.statusReason}
          </div>
        ) : null}
        {entry.diff.length > 0 ? (
          <div>
            <FieldLabel>Before -&gt; after</FieldLabel>
            <div className="mt-2">
              <DiffRows diff={entry.diff} />
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 rounded-[11px] border border-border px-[15px] py-[13px] font-mono text-[11.5px]">
          <MetadataRow copyable label="event_id" value={entry.metadata.event_id} />
          <MetadataRow copyable label="correlation_id" value={entry.metadata.correlation_id} />
          <MetadataRow label="app_version" value={entry.metadata.app_version} />
          <UserAgentRow value={entry.metadata.user_agent} />
        </div>
      </div>
    </Sheet>
  );
}
