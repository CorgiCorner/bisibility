import { SettingsSection } from "@/components/settings/SettingsSection";
import { type CreateTagAction, TagAddForm } from "./TagAddForm";
import {
  type DeleteTagAction,
  type RenameTagAction,
  TagManagementControls,
} from "./TagManagementControls";

type TagSegmentData = {
  color: string;
  count: number;
  label: string;
};

export type TagsSegmentsProps = {
  createTag?: CreateTagAction;
  deleteTag?: DeleteTagAction;
  projectId?: string;
  readOnly?: boolean;
  renameTag?: RenameTagAction;
  tags: readonly TagSegmentData[];
};

function keywordLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "keyword" : "keywords"}`;
}

export function TagsSegments({
  createTag,
  deleteTag,
  projectId,
  readOnly = false,
  renameTag,
  tags,
}: Readonly<TagsSegmentsProps>) {
  let addForm = null;
  if (readOnly) {
    addForm = (
      <span className="max-w-[280px] text-right text-[11.5px] leading-normal text-yellow">
        Read-only during migration. Cancel or finish the migration to manage tags.
      </span>
    );
  } else if (projectId && createTag) {
    addForm = <TagAddForm createTag={createTag} projectId={projectId} />;
  }

  return (
    <SettingsSection
      action={addForm}
      description="Global tags you can assign to keywords to analyse visibility by theme."
      contentClassName="p-0"
      title="Tags & segments"
    >
      {tags.length > 0 ? (
        <div className="divide-y divide-border-soft">
          {tags.map((tag) => (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3" key={tag.label}>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="h-[9px] w-[9px] shrink-0 rounded-sm"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="min-w-0 truncate font-mono text-[12.5px] font-semibold text-fg">
                  {tag.label}
                </span>
              </span>
              <span className="rounded-full bg-bg-sunken px-2.5 py-1 font-mono text-[10.5px] text-fg-muted">
                {keywordLabel(tag.count)}
              </span>
              {!readOnly && projectId && (renameTag || deleteTag) ? (
                <TagManagementControls
                  deleteTag={deleteTag}
                  projectId={projectId}
                  renameTag={renameTag}
                  tag={tag}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-5 text-[12.5px] text-fg-muted">
          No tags yet. Add a tag to make it available when tracking keywords.
        </div>
      )}
    </SettingsSection>
  );
}
