"use client";

import type {
  DeleteWorkspaceInput,
  UpdateProjectInput,
} from "@/app/app/(workspace)/[project]/settings/actions";
import { ApiKeysSection } from "@/components/settings/api-keys/ApiKeysSection";
import type { ApiKeyData, IssuedApiKey } from "@/components/settings/api-keys/api-key-model";
import { AuditLogCard } from "@/components/settings/danger/AuditLogCard";
import { WorkspaceDetailsForm } from "@/components/settings/workspace/WorkspaceDetailsForm";
import { PageContent } from "@/components/shell/PageContent";
import { Button, ConfirmModal } from "@/components/ui";
import type { NewWorkspaceSettings as NewWorkspaceSettingsData } from "@/lib/queries/settings";
import { appPath } from "@/lib/routing/app-path";
import type {
  IssueApiKeyInput,
  RegenerateApiKeyInput,
  RevokeApiKeyInput,
} from "@/lib/schemas/apiKey";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { PlugsIcon as Plugs, TrashIcon as Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

type IssueAction = (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
type RegenerateAction = (input: RegenerateApiKeyInput) => Promise<IssuedApiKey>;
type RevokeAction = (input: RevokeApiKeyInput) => Promise<unknown>;

export type NewWorkspaceSettingsProps = {
  apiKeys: readonly ApiKeyData[];
  billingSection?: ReactNode;
  canDeleteWorkspace: boolean;
  canManageWorkspace: boolean;
  canReadAudit?: boolean;
  data: NewWorkspaceSettingsData;
  deleteWorkspace?: (input: DeleteWorkspaceInput) => Promise<unknown>;
  issueKey?: IssueAction;
  migrationSection?: ReactNode;
  regenerateKey?: RegenerateAction;
  revokeKey?: RevokeAction;
  teamSection?: ReactNode;
  updateProject?: (input: UpdateProjectInput) => Promise<unknown>;
};

const sectionHeadingClass = "text-[15px] font-semibold";
const sectionHelpClass = "mt-[3px] text-[12.5px] text-fg-muted";
const dangerButtonSx = {
  borderColor: "var(--red)",
  color: "var(--red)",
  "&:hover": { backgroundColor: "var(--red)", borderColor: "var(--red)", color: "#fff" },
} as const;

export function NewWorkspaceSettings({
  apiKeys,
  billingSection,
  canDeleteWorkspace,
  canManageWorkspace,
  canReadAudit = false,
  data,
  deleteWorkspace,
  issueKey,
  migrationSection,
  regenerateKey,
  revokeKey,
  teamSection,
  updateProject,
}: Readonly<NewWorkspaceSettingsProps>) {
  const { workspace } = data;
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const confirmWord = workspace.domain || workspace.projectId;

  function handleDelete() {
    if (!deleteWorkspace) {
      setConfirmOpen(false);
      return;
    }
    setDeleteMessage(null);
    startTransition(() => {
      void deleteWorkspace({ confirmText: confirmWord, projectId: workspace.projectId })
        .then(() => {
          setConfirmOpen(false);
          router.push("/onboarding");
          router.refresh();
        })
        .catch((error: unknown) => {
          setConfirmOpen(false);
          setDeleteMessage(actionErrorMessage(error, "Workspace could not be deleted."));
        });
    });
  }

  return (
    <>
      <PageContent className="flex flex-col gap-[30px]" variant="form">
        <WorkspaceDetailsForm updateProject={updateProject} workspace={workspace} />

        <section>
          <div className={sectionHeadingClass}>Providers</div>
          <div className={sectionHelpClass}>
            Bring your own SERP and analytics keys. None connected yet.
          </div>
          <div className="mt-3.5 flex items-center gap-3 rounded-[14px] border border-dashed border-border-strong bg-bg-elev px-[18px] py-4">
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-bg-sunken text-fg-faint">
              <Plugs aria-hidden size={18} weight="bold" />
            </span>
            <span className="min-w-0 flex-1 text-[13px] text-fg-muted">
              Connect a SERP provider to start collecting rankings.
            </span>
            {canManageWorkspace ? (
              <Button
                href={appPath(workspace.projectId, "integrations")}
                size="sm"
                sx={{ flexShrink: 0 }}
              >
                Connect
              </Button>
            ) : null}
          </div>
        </section>

        <ApiKeysSection
          apiKeys={apiKeys}
          issueKey={canManageWorkspace ? issueKey : undefined}
          projectId={workspace.projectId}
          regenerateKey={canManageWorkspace ? regenerateKey : undefined}
          revokeKey={canManageWorkspace ? revokeKey : undefined}
        />
        {billingSection}
        {teamSection}
        {migrationSection}
        {canReadAudit ? <AuditLogCard projectRef={workspace.projectId} /> : null}

        {canDeleteWorkspace ? (
          <section>
            <div className="rounded-[14px] border border-red bg-bg-elev px-5 py-[18px]">
              <div className="flex flex-wrap items-center justify-between gap-3.5">
                <div>
                  <div className="text-[14.5px] font-semibold text-red">Danger zone</div>
                  <div className="mt-[3px] text-[12.5px] text-fg-muted">
                    Delete this workspace and all its data. This cannot be undone.
                  </div>
                </div>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  size="sm"
                  startIcon={<Trash aria-hidden size={14} />}
                  sx={dangerButtonSx}
                  type="button"
                  variant="secondary"
                >
                  Delete workspace
                </Button>
              </div>
              {deleteMessage ? (
                <p className="m-0 mt-3 text-[12px] text-red">{deleteMessage}</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </PageContent>
      {canDeleteWorkspace ? (
        <ConfirmModal
          busy={isPending}
          kind="deleteWorkspace"
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleDelete}
          open={confirmOpen}
          typeWord={confirmWord}
        />
      ) : null}
    </>
  );
}
