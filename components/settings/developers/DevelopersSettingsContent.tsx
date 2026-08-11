import type { IssuedApiKey } from "@/components/settings/api-keys/api-key-model";
import { ApiKeysCard } from "@/components/settings/developers/ApiKeysCard";
import { DeployWebhooksCard } from "@/components/settings/developers/DeployWebhooksCard";
import type {
  CreateDeployHookAction,
  DeployHookData,
  MutateDeployHookAction,
  RotateDeployHookAction,
  SendDeployHookTestAction,
} from "@/components/settings/webhooks/deploy-hook-model";
import type { SettingsView } from "@/lib/queries/settings";
import type {
  IssueApiKeyInput,
  RegenerateApiKeyInput,
  revokeApiKeySchema,
} from "@/lib/schemas/apiKey";
import type { z } from "zod";

type RevokeApiKeyInput = z.infer<typeof revokeApiKeySchema>;

export type DevelopersSettingsContentProps = {
  apiKeys: readonly SettingsView["apiKeys"][number][];
  canManage: boolean;
  createHook?: CreateDeployHookAction;
  deleteHook?: MutateDeployHookAction;
  disableHook?: MutateDeployHookAction;
  docsHref: string;
  endpointUrl: string;
  hooks: readonly DeployHookData[];
  issueKey?: (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
  projectId: string;
  regenerateKey?: (input: RegenerateApiKeyInput) => Promise<IssuedApiKey>;
  revokeKey?: (input: RevokeApiKeyInput) => Promise<unknown>;
  rotateHook?: RotateDeployHookAction;
  sendTestHook?: SendDeployHookTestAction;
};

export function DevelopersSettingsContent({
  apiKeys,
  canManage,
  createHook,
  deleteHook,
  disableHook,
  docsHref,
  endpointUrl,
  hooks,
  issueKey,
  projectId,
  regenerateKey,
  revokeKey,
  rotateHook,
  sendTestHook,
}: Readonly<DevelopersSettingsContentProps>) {
  return (
    <div className="flex max-w-[640px] flex-col gap-[14px]" data-developers-settings="">
      <ApiKeysCard
        apiKeys={apiKeys}
        docsHref={docsHref}
        issueKey={canManage ? issueKey : undefined}
        projectId={projectId}
        regenerateKey={canManage ? regenerateKey : undefined}
        revokeKey={canManage ? revokeKey : undefined}
      />
      <DeployWebhooksCard
        createHook={canManage ? createHook : undefined}
        deleteHook={canManage ? deleteHook : undefined}
        disableHook={canManage ? disableHook : undefined}
        endpointUrl={endpointUrl}
        hooks={hooks}
        projectId={projectId}
        rotateHook={canManage ? rotateHook : undefined}
        sendTestHook={canManage ? sendTestHook : undefined}
      />
    </div>
  );
}
