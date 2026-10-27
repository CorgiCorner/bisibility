import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import type { Meta, StoryObj } from "@storybook/react";
import { ProviderAccessEmptyState } from "./ProviderAccessEmptyState";
import { ProviderAccessGate } from "./ProviderAccessGate";
import { ProviderAccessScopeProvider } from "./ProviderAccessScopeProvider";

const meta = {
  title: "UI/ProviderAccessGate",
  component: ProviderAccessGate,
  decorators: [withSharedMessages],
} satisfies Meta<typeof ProviderAccessGate>;
export default meta;
type Story = StoryObj<typeof meta>;
const href = "/app/prj_example/integrations";
const field = (
  <label>
    Keyword <input defaultValue="example" />
  </label>
);
export const Blocked: Story = {
  args: { blocked: true, children: field, href, providers: ["DataForSEO"] },
};
export const Reconnect: Story = {
  args: { blocked: true, children: field, href, reconnect: true, providers: ["DataForSEO"] },
};
export const Unblocked: Story = { args: { blocked: false, children: field } };
export const AccessScopes: Story = {
  args: { blocked: true, children: field },
  render: () => (
    <div className="grid gap-6 bg-bg p-6 text-fg">
      {[
        { canManageProviders: true, projectRef: "prj_example", readOnly: false },
        { canManageProviders: false, projectRef: "prj_example", readOnly: false },
        { canManageProviders: false, projectRef: "prj_example", readOnly: true },
      ].map((scope) => (
        <section key={`${scope.canManageProviders}-${scope.readOnly}`}>
          <h2>{scope.readOnly ? "Read only" : scope.canManageProviders ? "Manager" : "Member"}</h2>
          <ProviderAccessScopeProvider scope={scope}>
            <ProviderAccessEmptyState href={href} providers={["DataForSEO"]} surface="keywords" />
            <ProviderAccessGate blocked href={href} providers={["DataForSEO"]}>
              {field}
            </ProviderAccessGate>
          </ProviderAccessScopeProvider>
        </section>
      ))}
    </div>
  ),
};
export const Unavailable: Story = {
  args: { blocked: true, children: field },
  render: () => <ProviderAccessEmptyState href={href} providers={[]} surface="domain" />,
};
