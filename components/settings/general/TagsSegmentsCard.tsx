"use client";

import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Button, Modal, TagAdder, TagChip } from "@/components/ui";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
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

function usageLabel(keywordCount: number, segmentCount: number) {
  const parts: string[] = [];
  if (keywordCount > 0) {
    parts.push(`${keywordCount.toLocaleString("en-US")} keyword${keywordCount === 1 ? "" : "s"}`);
  }
  if (segmentCount > 0) {
    parts.push(`${segmentCount.toLocaleString("en-US")} segment${segmentCount === 1 ? "" : "s"}`);
  }
  return parts.join(" and ");
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
  const [tags, setTags] = useState(() => [...initialTags]);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GeneralTag | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function addTag(name: string) {
    if (tags.some((tag) => tagKey(tag.label) === tagKey(name))) {
      setRowError(`${name} already exists.`);
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
      setRowError(actionErrorMessage(error, "Tag could not be added."));
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
      setRowError(actionErrorMessage(error, "Tag could not be removed."));
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

  const pendingUsage = pendingDelete
    ? usageLabel(pendingDelete.keywordCount, pendingDelete.segmentCount)
    : "";

  return (
    <>
      <SettingsCard
        className={generalSettingsCardGeometryClassNames.tagsSegments}
        description="Tags group keywords and pages. Saved views can filter by them."
        showSave={false}
        title="Tags"
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
              Cancel
            </Button>
            <Button loading={deleting} onClick={() => void confirmRemove()} variant="destructive">
              Remove tag
            </Button>
          </div>
        }
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
        size="sm"
        title={pendingDelete ? `Remove ${pendingDelete.label}?` : undefined}
      >
        {pendingUsage ? (
          <p className="m-0 text-ui-body text-fg-muted">{pendingUsage} use it.</p>
        ) : null}
      </Modal>
    </>
  );
}
