"use client";

import {
  type PageTagDraft,
  PageTagDrawer,
  type PageTagPreview,
} from "@/components/pages/PageTagDrawer";
import { pageTagFormForRow, pageTagFormForTag } from "@/components/pages/page-tag-form";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import type { SettingsTagRow } from "@/lib/queries/tag-settings";
import type { PageTagFormValues } from "@/lib/schemas/page-tag";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DeleteTagDialog, MergeTagDialog, RenameTagDialog } from "./SettingsTagsDialogs";
import { SettingsTagsTable } from "./SettingsTagsTable";
import { settingsTagsBlocks, settingsTagsLayoutClassName } from "./settings-tags-layout";

type DialogState =
  | { row: SettingsTagRow; type: "delete" | "merge" | "rename" }
  | { type: "create" }
  | { row: SettingsTagRow; type: "edit" }
  | null;

export type SettingsTagActions = {
  deleteTag: (input: { name: string; projectId: string }) => Promise<ActionResult<unknown>>;
  mergeTag: (input: {
    projectId: string;
    sourceId: string;
    targetId: string;
  }) => Promise<ActionResult<unknown>>;
  previewRule: (draft: PageTagDraft) => Promise<PageTagPreview>;
  renameTag: (input: {
    fromName: string;
    projectId: string;
    toName: string;
  }) => Promise<ActionResult<unknown>>;
  saveRule: (input: PageTagFormValues & { tagId?: string }) => Promise<unknown>;
};

export function SettingsTagsSection({
  actions,
  canCreate,
  canDelete,
  canEdit,
  initialDialog = null,
  projectId,
  rows,
  sitemaps,
}: Readonly<{
  actions: SettingsTagActions;
  canCreate: boolean;
  canDelete: boolean;
  canEdit: boolean;
  initialDialog?: DialogState;
  projectId: string;
  rows: readonly SettingsTagRow[];
  sitemaps: readonly string[];
}>) {
  const t = useTranslations("projectSettingsTags");
  const pages = useTranslations("projectPages");
  const router = useRouter();
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(initialDialog);
  const [pending, setPending] = useState(false);
  const row = dialog && "row" in dialog ? dialog.row : null;
  const options = rows.map((tag) => ({ id: tag.id, keywordCount: tag.keywords, name: tag.name }));

  async function run(work: () => Promise<void>, fallback: string) {
    setPending(true);
    try {
      await work();
      setDialog(null);
      router.refresh();
    } catch (error: unknown) {
      showToast(actionErrorMessage(error, fallback), { severity: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={settingsTagsLayoutClassName}
      data-settings-tags-blocks={settingsTagsBlocks.join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 text-ui-caption text-fg-muted">{t("lead")}</p>
          <p className="m-0 text-ui-caption text-fg-muted">{t("ruleLead")}</p>
        </div>
        <Button disabled={!canCreate} onClick={() => setDialog({ type: "create" })} type="button">
          {t("new")}
        </Button>
      </div>
      <SettingsTagsTable
        canDelete={canDelete}
        canEdit={canEdit}
        onDelete={(next) => setDialog({ row: next, type: "delete" })}
        onEdit={(next) => setDialog({ row: next, type: "edit" })}
        onMerge={(next) => setDialog({ row: next, type: "merge" })}
        onRename={(next) => setDialog({ row: next, type: "rename" })}
        rows={rows}
      />
      <section className="flex flex-col gap-1">
        <h2 className="m-0 text-ui-body font-semibold text-fg">{t("where.title")}</h2>
        <p className="m-0 text-ui-caption text-fg-muted">{t("where.body")}</p>
      </section>
      <DeleteTagDialog
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (!row) return;
          void run(async () => {
            unwrapActionResult(await actions.deleteTag({ name: row.name, projectId }));
          }, t("delete.error"));
        }}
        pending={pending}
        row={dialog?.type === "delete" ? row : null}
      />
      <MergeTagDialog
        key={dialog?.type === "merge" ? row?.id : "merge"}
        onClose={() => setDialog(null)}
        onConfirm={(targetId) => {
          if (!row) return;
          void run(async () => {
            unwrapActionResult(await actions.mergeTag({ projectId, sourceId: row.id, targetId }));
          }, t("merge.error"));
        }}
        pending={pending}
        row={dialog?.type === "merge" ? row : null}
        rows={rows}
      />
      <RenameTagDialog
        key={dialog?.type === "rename" ? row?.id : "rename"}
        names={rows.map((tag) => tag.name)}
        onClose={() => setDialog(null)}
        onConfirm={(name) => {
          if (!row) return;
          void run(async () => {
            unwrapActionResult(
              await actions.renameTag({ fromName: row.name, projectId, toName: name }),
            );
          }, t("rename.error"));
        }}
        pending={pending}
        row={dialog?.type === "rename" ? row : null}
      />
      {dialog?.type === "create" || dialog?.type === "edit" ? (
        <PageTagDrawer
          canWrite={dialog.type === "edit" ? canEdit : canCreate}
          initial={
            dialog.type === "edit"
              ? pageTagFormForRow({
                  name: dialog.row.name,
                  rule: dialog.row.rule,
                })
              : pageTagFormForTag({ name: "" })
          }
          onClose={() => setDialog(null)}
          open
          options={options}
          preview={actions.previewRule}
          save={async (values) => {
            await actions.saveRule({
              ...values,
              tagId: dialog.type === "edit" ? dialog.row.id : undefined,
            });
            router.refresh();
          }}
          sitemaps={sitemaps}
          title={
            dialog.type === "edit"
              ? pages("drawer.titleEdit", { name: dialog.row.name })
              : pages("drawer.titleNew")
          }
        />
      ) : null}
    </div>
  );
}
