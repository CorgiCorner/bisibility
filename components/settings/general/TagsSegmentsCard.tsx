"use client";

import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TagAdder } from "@/components/ui/TagAdder";
import { TagChip } from "@/components/ui/TagChip";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type GeneralTag = {
  color: string;
  keywordCount: number;
  label: string;
  segmentCount: number;
};

export type CreateTagAction = (input: {
  name: string;
  projectId: string;
}) => Promise<ActionResult<{ created: boolean }>>;

export type DeleteTagAction = (input: {
  name: string;
  projectId: string;
}) => Promise<ActionResult<{ deleted: number }>>;

export type TagsSegmentsCardProps = {
  canCreate: boolean;
  canDelete: boolean;
  createTag?: CreateTagAction;
  deleteTag?: DeleteTagAction;
  projectId: string;
  tags: readonly GeneralTag[];
};

function tagKey(label: string) {
  return label.trim().toLocaleLowerCase();
}

export function TagsSegmentsCard({
  canCreate,
  canDelete,
  createTag,
  deleteTag,
  projectId,
  tags: initialTags,
}: Readonly<TagsSegmentsCardProps>) {
  const router = useRouter();
  const t = useTranslations("projectSettingsGeneral.tags");
  const [tags, setTags] = useState(() => [...initialTags]);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GeneralTag | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function addTag(name: string) {
    if (tags.some((tag) => tagKey(tag.label) === tagKey(name))) {
      setRowError(t("duplicate", { name }));
      return;
    }
    if (!createTag) return;

    setRowError(null);
    try {
      unwrapActionResult(await createTag({ name, projectId }));
      setTags((current) => [
        ...current,
        { color: "var(--accent)", keywordCount: 0, label: name, segmentCount: 0 },
      ]);
      router.refresh();
    } catch (error: unknown) {
      setRowError(actionErrorMessage(error, t("writeError")));
    }
  }

  async function removeTag(tag: GeneralTag): Promise<boolean> {
    if (!deleteTag) return false;
    setRowError(null);
    try {
      unwrapActionResult(await deleteTag({ name: tag.label, projectId }));
      setTags((current) =>
        current.filter((candidate) => tagKey(candidate.label) !== tagKey(tag.label)),
      );
      router.refresh();
      return true;
    } catch (error: unknown) {
      setRowError(actionErrorMessage(error, t("removeError")));
      return false;
    }
  }

  function requestRemove(tag: GeneralTag) {
    if (tag.keywordCount > 0 || tag.segmentCount > 0) {
      setPendingDelete(tag);
      return;
    }
    void removeTag(tag);
  }

  async function confirmRemove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (await removeTag(pendingDelete)) {
        setPendingDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  function pendingUsageMessage() {
    if (!pendingDelete) return null;
    if (pendingDelete.keywordCount === 0) {
      return t("usageSegmentOnly", { count: pendingDelete.segmentCount });
    }
    if (pendingDelete.segmentCount === 0) {
      return t("usageKeywordOnly", { count: pendingDelete.keywordCount });
    }
    if (pendingDelete.keywordCount === 1) {
      return t("usageBothOneKeyword", { segmentCount: pendingDelete.segmentCount });
    }
    return t("usageBothManyKeywords", {
      keywordCount: pendingDelete.keywordCount,
      segmentCount: pendingDelete.segmentCount,
    });
  }

  const pendingUsage = pendingUsageMessage();

  return (
    <>
      <SettingsCard
        className={generalSettingsCardGeometryClassNames.tagsSegments}
        description={t("description")}
        showSave={false}
        title={t("title")}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <TagChip
                key={tagKey(tag.label)}
                keywordCount={tag.keywordCount}
                label={tag.label}
                onRemove={canDelete ? () => requestRemove(tag) : undefined}
              />
            ))}
            {canCreate ? <TagAdder onAdd={addTag} /> : null}
          </div>
          {rowError ? <p className="m-0 text-[11px] text-red-text">{rowError}</p> : null}
        </div>
      </SettingsCard>
      <Modal
        dismissDisabled={deleting}
        footer={
          <div className="flex justify-end gap-2">
            <Button disabled={deleting} onClick={() => setPendingDelete(null)} variant="secondary">
              {t("cancel")}
            </Button>
            <Button loading={deleting} onClick={() => void confirmRemove()} variant="destructive">
              {t("remove")}
            </Button>
          </div>
        }
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
        size="sm"
        title={pendingDelete ? t("removeTitle", { name: pendingDelete.label }) : undefined}
      >
        {pendingUsage ? <p className="m-0 text-ui-body text-fg-muted">{pendingUsage}</p> : null}
      </Modal>
    </>
  );
}
