import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { NavItem } from "@/lib/nav/nav-items";
import messagesEn from "@/messages/core/en/shell.json";
import messagesEs from "@/messages/core/es-ES/shell.json";
import messagesJa from "@/messages/core/ja/shell.json";
import messagesPl from "@/messages/core/pl/shell.json";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarRailGroups } from "./SidebarRail";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

const sections = [
  {
    key: "aiVisibility",
    title: "AI Visibility",
    segment: "ai-visibility",
    group: "modules",
    scope: "own-axis",
  },
  {
    key: "promptExplorer",
    title: "Prompt Explorer",
    segment: "prompt-explorer",
    group: "modules",
    scope: "own-axis",
  },
  {
    key: "siteAudit",
    title: "Site Audit",
    segment: "site-audit",
    group: "modules",
    scope: "own-axis",
  },
  {
    key: "projectContext",
    title: "Project Context",
    segment: "context",
    group: "project",
    scope: "project",
  },
  {
    key: "agentReports",
    title: "Agent Reports",
    segment: "agent-reports",
    group: "project",
    scope: "project",
  },
] as const;

const items: NavItem[] = sections.map((section) => ({
  label: section.title,
  href: `/app/prj_abcdefghijklmnopqrstuvwx/${section.segment}`,
  group: section.group,
  scope: section.scope,
  icon: FileTextIcon,
}));
const locales = [
  { locale: "en", messages: messagesEn },
  { locale: "pl", messages: messagesPl },
  { locale: "es-ES", messages: messagesEs },
  { locale: "ja", messages: messagesJa },
] as const;

describe.each(locales)("research sidebar in $locale", ({ locale, messages }) => {
  it.each([false, true])("keeps translated accessible links with collapsed=%s", (collapsed) => {
    renderWithFeatureMessages(
      <SidebarRailGroups
        collapsed={collapsed}
        currentHref={`${items[4].href}/agr_abcdefghijklmnopqrstuvwx`}
        items={items}
      />,
      { locale, messages },
    );
    for (const [index, section] of sections.entries()) {
      const link = screen.getByRole("link", { name: messages.shell.navigation.items[section.key] });
      expect(link).toHaveAttribute("href", items[index].href);
      if (section.key === "agentReports") expect(link).toHaveAttribute("aria-current", "page");
    }
  });
});
