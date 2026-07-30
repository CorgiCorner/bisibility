import { DeliveryChannelsField } from "@/components/alerts/DeliveryChannelsField";
import { RecipientFields } from "@/components/alerts/NewRuleDrawerControls";
import { WebhookEndpointEditor } from "@/components/alerts/WebhookEndpointEditor";
import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import type { UseFormReturn } from "react-hook-form";

type NewRuleDeliveryFieldsProps = Pick<
  UseFormReturn<NewRuleForm>,
  "register" | "setValue" | "watch"
> & {
  deleteWebhookEndpointAction?: (input: unknown) => Promise<unknown>;
  projectId: string;
  targets: AlertTargetOptions;
  testWebhookEndpointAction?: (input: unknown) => Promise<unknown>;
  upsertWebhookEndpointAction?: (input: unknown) => Promise<unknown>;
};

export function NewRuleDeliveryFields({
  deleteWebhookEndpointAction,
  projectId,
  register,
  setValue,
  targets,
  testWebhookEndpointAction,
  upsertWebhookEndpointAction,
  watch,
}: Readonly<NewRuleDeliveryFieldsProps>) {
  return (
    <section>
      <div className="mb-[9px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
        Delivery
      </div>
      <DeliveryChannelsField register={register} setValue={setValue} watch={watch} />
      {watch("channels").includes("email") ? (
        <RecipientFields
          recipientIds={watch("recipientIds") ?? []}
          setValue={setValue}
          targets={targets}
        />
      ) : null}
      {watch("channels").includes("webhook") && upsertWebhookEndpointAction ? (
        <WebhookEndpointEditor
          action={upsertWebhookEndpointAction}
          allowPrivateNetwork={targets.webhookPrivateNetworkAllowed ?? false}
          deleteAction={deleteWebhookEndpointAction}
          endpoints={targets.webhookEndpoints ?? []}
          projectId={projectId}
          testAction={testWebhookEndpointAction}
        />
      ) : null}
    </section>
  );
}
