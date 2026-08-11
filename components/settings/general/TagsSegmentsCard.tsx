"use client";

import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Button, Input } from "@/components/ui";
import { type ActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { PlusIcon as Plus, XIcon as X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const tagFormSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required.").max(48),
});

type TagForm = z.infer<typeof tagFormSchema>;

export type GeneralTag = {
  color: string;
  label: string;
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
  tags,
}: Readonly<TagsSegmentsCardProps>) {
  const router = useRouter();
  const [draftTags, setDraftTags] = useState(() => [...tags]);
  const [isAdding, setIsAdding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedTags = useRef(new Set(tags.map((tag) => tagKey(tag.label)))).current;
  const form = useForm<TagForm>({
    defaultValues: { name: "" },
    mode: "onChange",
    resolver: zodResolver(tagFormSchema),
  });

  function stageTag(values: TagForm, markDirty: () => void) {
    const label = values.name.trim();
    if (draftTags.some((tag) => tagKey(tag.label) === tagKey(label))) {
      form.setError("name", { message: "This tag is already staged." });
      return;
    }
    setDraftTags((current) => [...current, { color: "var(--accent)", label }]);
    form.reset({ name: "" });
    setIsAdding(false);
    markDirty();
  }

  async function saveTags() {
    const currentTagKeys = new Set(draftTags.map((tag) => tagKey(tag.label)));
    const tagsToCreate = draftTags.filter((tag) => !savedTags.has(tagKey(tag.label)));
    const tagsToDelete = [...savedTags].filter((tag) => !currentTagKeys.has(tag));

    if ((tagsToCreate.length > 0 && !createTag) || (tagsToDelete.length > 0 && !deleteTag)) {
      return;
    }

    setSaveError(null);
    try {
      for (const tag of tagsToCreate) {
        if (createTag) {
          unwrapActionResult(await createTag({ name: tag.label, projectId }));
        }
      }
      for (const name of tagsToDelete) {
        if (deleteTag) {
          unwrapActionResult(await deleteTag({ name, projectId }));
        }
      }
      savedTags.clear();
      for (const name of currentTagKeys) savedTags.add(name);
      router.refresh();
    } catch (error: unknown) {
      setSaveError(actionErrorMessage(error, "Tags could not be saved."));
      throw error;
    }
  }

  return (
    <SettingsCard
      className={generalSettingsCardGeometryClassNames.tagsSegments}
      description="Tags group keywords and pages; every saved segment is built from them."
      onSave={saveTags}
      title="Tags & segments"
    >
      {({ markDirty }) => (
        <div className="flex flex-wrap items-center gap-2">
          {draftTags.map((tag) => (
            <span
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-bg-sunken py-0 pl-2.5 pr-1.5 font-mono text-[11px] text-fg"
              key={tagKey(tag.label)}
            >
              {tag.label}
              {canDelete ? (
                <button
                  aria-label={`Remove ${tag.label}`}
                  className="grid h-4 w-4 place-items-center rounded-full text-fg-muted outline-none transition-colors hover:bg-bg-elev hover:text-fg focus-visible:bg-bg-elev focus-visible:text-fg"
                  onClick={() => {
                    setDraftTags((current) =>
                      current.filter((candidate) => tagKey(candidate.label) !== tagKey(tag.label)),
                    );
                    markDirty();
                  }}
                  type="button"
                >
                  <X aria-hidden size={11} weight="bold" />
                </button>
              ) : null}
            </span>
          ))}
          {canCreate && isAdding ? (
            <form
              className="flex items-start gap-2"
              onSubmit={form.handleSubmit((values) => stageTag(values, markDirty))}
            >
              <span>
                <label className="sr-only" htmlFor="general-new-tag">
                  New tag name
                </label>
                <Input
                  autoComplete="off"
                  className="h-8 min-h-8 w-[180px] px-2.5 text-[12px]"
                  id="general-new-tag"
                  placeholder="New tag"
                  {...form.register("name")}
                />
                {form.formState.errors.name ? (
                  <span className="mt-1 block text-[11px] text-red-text">
                    {form.formState.errors.name.message}
                  </span>
                ) : null}
              </span>
              <Button
                size="xs"
                startIcon={<Plus aria-hidden size={13} weight="bold" />}
                type="submit"
              >
                Add tag
              </Button>
            </form>
          ) : canCreate ? (
            <button
              aria-label="Add tag"
              className="inline-flex h-7 items-center rounded-full border border-border bg-bg-sidebar px-3 text-[12.5px] font-semibold text-fg outline-none transition-colors hover:bg-nav-active focus-visible:bg-nav-active"
              onClick={() => setIsAdding(true)}
              type="button"
            >
              + Add tag
            </button>
          ) : null}
          {saveError ? (
            <p className="m-0 basis-full text-[12px] text-red-text">{saveError}</p>
          ) : null}
        </div>
      )}
    </SettingsCard>
  );
}
