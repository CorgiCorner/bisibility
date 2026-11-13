"use client";

import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { SettingsTagRow, SettingsTagUsageKind } from "@/lib/queries/tag-settings";
import { tagNameFormSchemaFor } from "@/lib/schemas/tag";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

function countKind(row: SettingsTagRow, kind: SettingsTagUsageKind) {
  return row.usage.filter((item) => item.kind === kind).length;
}

export function deleteUsageMessage(
  row: SettingsTagRow,
  t: ReturnType<typeof useTranslations<"projectSettingsTags">>,
) {
  if (row.keywords === 0 && row.segmentCount === 0) return null;
  if (row.keywords === 0) return t("delete.usageSegmentOnly", { count: row.segmentCount });
  if (row.segmentCount === 0) return t("delete.usageKeywordOnly", { count: row.keywords });
  if (row.keywords === 1) {
    return t("delete.usageBothOneKeyword", { segmentCount: row.segmentCount });
  }
  return t("delete.usageBothManyKeywords", {
    keywordCount: row.keywords,
    segmentCount: row.segmentCount,
  });
}

export function DeleteTagDialog({
  onClose,
  onConfirm,
  pending,
  row,
}: Readonly<{
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  row: SettingsTagRow | null;
}>) {
  const t = useTranslations("projectSettingsTags");
  const usage = row ? deleteUsageMessage(row, t) : null;
  return (
    <Modal
      dismissDisabled={pending}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={pending} onClick={onClose} type="button" variant="secondary">
            {t("delete.cancel")}
          </Button>
          <Button loading={pending} onClick={onConfirm} type="button" variant="destructive">
            {t("delete.confirm")}
          </Button>
        </div>
      }
      onClose={onClose}
      open={row !== null}
      size="sm"
      title={row ? t("delete.title", { name: row.name }) : undefined}
    >
      {usage ? <p className="m-0 text-ui-body text-fg-muted">{usage}</p> : null}
    </Modal>
  );
}

function mergeSummary(
  row: SettingsTagRow,
  target: SettingsTagRow,
  t: ReturnType<typeof useTranslations<"projectSettingsTags">>,
) {
  const parts = [
    row.pages > 0 ? t("merge.pages", { count: row.pages }) : null,
    row.keywords > 0 ? t("merge.keywords", { count: row.keywords }) : null,
    countKind(row, "alert") > 0 ? t("merge.alerts", { count: countKind(row, "alert") }) : null,
    countKind(row, "saved_view") > 0
      ? t("merge.savedViews", { count: countKind(row, "saved_view") })
      : null,
    countKind(row, "keyword_segment") > 0
      ? t("merge.keywordSegments", { count: countKind(row, "keyword_segment") })
      : null,
  ].filter((part): part is string => part !== null);
  const summary =
    parts.length > 0
      ? t("merge.summary", { counts: parts.join(", "), target: target.name })
      : t("merge.none");
  const rule = row.rule && !target.rule ? t("merge.rule", { target: target.name }) : null;
  return rule ? `${summary} ${rule}` : summary;
}

export function MergeTagDialog({
  onClose,
  onConfirm,
  pending,
  row,
  rows,
}: Readonly<{
  onClose: () => void;
  onConfirm: (targetId: string) => void;
  pending: boolean;
  row: SettingsTagRow | null;
  rows: readonly SettingsTagRow[];
}>) {
  const t = useTranslations("projectSettingsTags");
  const options = rows.filter((candidate) => candidate.id !== row?.id);
  const [targetId, setTargetId] = useState(options[0]?.id ?? "");
  const target = options.find((candidate) => candidate.id === targetId) ?? options[0];
  return (
    <Modal
      dismissDisabled={pending}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={pending} onClick={onClose} type="button" variant="secondary">
            {t("merge.cancel")}
          </Button>
          <Button
            disabled={!target || pending}
            loading={pending}
            onClick={() => target && onConfirm(target.id)}
            type="button"
            variant="primary"
          >
            {t("merge.confirm")}
          </Button>
        </div>
      }
      onClose={onClose}
      open={row !== null}
      size="sm"
      title={row ? t("merge.title", { name: row.name }) : undefined}
    >
      {row && target ? (
        <div className="flex flex-col gap-3">
          <MenuSelect
            ariaLabel={t("merge.choose")}
            onChange={setTargetId}
            options={options.map((candidate) => ({ label: candidate.name, value: candidate.id }))}
            value={target.id}
          />
          <p className="m-0 text-ui-body text-fg-muted">{mergeSummary(row, target, t)}</p>
        </div>
      ) : null}
    </Modal>
  );
}

export function RenameTagDialog({
  names,
  onClose,
  onConfirm,
  pending,
  row,
}: Readonly<{
  names: readonly string[];
  onClose: () => void;
  onConfirm: (name: string) => void;
  pending: boolean;
  row: SettingsTagRow | null;
}>) {
  const t = useTranslations("projectSettingsTags");
  const fieldId = useId();
  const form = useForm<{ name: string }>({
    defaultValues: { name: row?.name ?? "" },
    resolver: zodResolver(
      tagNameFormSchemaFor({ required: t("rename.required"), tooLong: t("rename.tooLong") }),
    ),
  });
  const taken = form.formState.errors.name?.message;
  return (
    <Modal
      dismissDisabled={pending}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={pending} onClick={onClose} type="button" variant="secondary">
            {t("rename.cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={form.handleSubmit((values) => {
              const name = values.name.trim();
              if (names.some((candidate) => candidate === name && candidate !== row?.name)) {
                form.setError("name", { message: t("rename.exists", { name }) });
                return;
              }
              onConfirm(name);
            })}
            type="button"
            variant="primary"
          >
            {t("rename.confirm")}
          </Button>
        </div>
      }
      onClose={onClose}
      open={row !== null}
      size="sm"
      title={row ? t("rename.title", { name: row.name }) : undefined}
    >
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={fieldId} label={t("rename.label")} />
        <Input {...form.register("name")} aria-invalid={Boolean(taken)} id={fieldId} />
        {taken ? (
          <span className="text-ui-caption text-red-text" role="alert">
            {taken}
          </span>
        ) : null}
      </div>
    </Modal>
  );
}
