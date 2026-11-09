import { meta as compositionMeta } from "@/components/admin/redesign/oss-story-fixtures-1";
import { ossAdminRoute, ossAdminRoutes } from "@/lib/instance-admin/routes";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { useTranslations } from "next-intl";
import { AdminRouteChrome } from "./AdminRouteChrome";
import { OssLivePage } from "./OssLivePage";
import { fixture } from "./page-fixtures.test-fixture";

function LiveRoute({ view }: { view: string }) {
  const t = useTranslations("instanceAdmin");
  const active = ossAdminRoute(view);
  return (
    <AdminRouteChrome
      active={active}
      tabs={ossAdminRoutes.filter(
        (route, index, all) => all.findIndex((item) => item.tab === route.tab) === index,
      )}
      subtabs={ossAdminRoutes.filter((route) => route.tab === active.tab)}
      labels={{
        context: t("shell.context"),
        back: t("shell.backToApp"),
        title: t("shell.title"),
        description: t("pages.description"),
        navigation: t("navigation.label"),
        views: t("shell.viewNavigation", { tab: t(active.tabKey) }),
        question: t(active.questionKey),
        tabs: Object.fromEntries(ossAdminRoutes.map((route) => [route.tab, t(route.tabKey)])),
        subtabs: Object.fromEntries(ossAdminRoutes.map((route) => [route.view, t(route.viewKey)])),
      }}
    >
      <OssLivePage view={view} data={fixture} />
    </AdminRouteChrome>
  );
}
const meta = {
  title: "Admin/Real routes",
  component: LiveRoute,
  // This decorator only reads locale globals and wraps the supplied story.
  decorators: compositionMeta.decorators as Decorator[],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof LiveRoute>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Status: Story = { args: { view: "Status" } };
export const Worker: Story = { args: { view: "Worker" } };
export const Checks: Story = { args: { view: "Checks" } };
export const DataSources: Story = { args: { view: "Data sources" } };
export const Tasks: Story = { args: { view: "Tasks" } };
export const Notifications: Story = { args: { view: "Notifications" } };
export const Accounts: Story = { args: { view: "Accounts" } };
export const EmailSending: Story = { args: { view: "Sending today" } };
export const EmailSettings: Story = { args: { view: "Settings" } };
export const Audit: Story = { args: { view: "Audit" } };
