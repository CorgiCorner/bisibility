import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(?:tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path)
        ? [path]
        : [];
  });
}

function sideBorders(source: string): string[] {
  const widths = source.matchAll(
    /(?<![\w-])border-[lrse](?:-(?:\d+(?:\.\d+)?|\[[^\]\r\n]+\]|\([^)\r\n]+\)))?(?![\w-])/g,
  );
  const declarations = source.matchAll(
    /\bborder-(?:left|right|inline-start|inline-end)(?:-width)?\s*:[^;\n]+;|\bborder(?:Left|Right|InlineStart|InlineEnd)(?:Width)?\s*:[^,\n]+,?/g,
  );
  return [...widths, ...declarations].map((match) => match[0]);
}

type Separator = { path: string; token: string; reason: string; count?: number };
// Exact file + token + occurrence count: another use in the same file still fails.
// Test files contain assertions/negative fixtures, so only production and stories are scanned.
const separators: Separator[] = [
  {
    path: "app/(regional)/(auth)/login/page.tsx",
    token: "border-r",
    reason: "Auth illustration/form divider.",
  },
  {
    path: "components/domain-overview/DomainOverviewWhatChanged.module.css",
    token: "border-left: 1px solid var(--border-soft);",
    count: 2,
    reason: "Responsive metric column separators.",
  },
  {
    path: "components/domain-overview/DomainOverviewWhatChanged.module.css",
    token: "border-left: 0;",
    count: 2,
    reason: "Resets the metric column separators when stacked.",
  },
  {
    path: "components/keyword-detail/empty/PositionHistoryNoChecksInRange.tsx",
    token: "border-l",
    reason: "Divider between inline empty-state actions.",
  },
  {
    path: "components/keyword-detail/empty/SchedulePausedBudgetExhausted.tsx",
    token: "border-l",
    reason: "Divider between inline empty-state actions.",
  },
  {
    path: "components/keywords/filters/DimensionSwitcher.tsx",
    token: "border-l",
    reason: "Separates the dropdown trigger from the dimension value.",
  },
  {
    path: "components/marketing/content/integrations/flow.module.css",
    token: "border-left: 1px solid var(--border-soft);",
    reason: "Flow stage column divider.",
  },
  {
    path: "components/marketing/content/loading/task.tsx",
    token: "border-r",
    reason: "Skeleton of the auth illustration/form divider.",
  },
  {
    path: "components/marketing/features/mockups/backlinks/backlinks-mock.module.css",
    token: "border-inline-start: 0;",
    reason: "Resets a shared drawer divider at the narrow breakpoint.",
  },
  {
    path: "components/marketing/features/mockups/code/code-tabs.module.css",
    token: "border-left: 1px solid var(--code-fg);",
    reason: "Animated text insertion caret, not emphasis.",
  },
  {
    path: "components/marketing/features/mockups/gsc/search-console-mock.module.css",
    token: "border-right: 1px solid var(--border-soft);",
    reason: "Provenance column separators.",
  },
  {
    path: "components/marketing/features/mockups/primitives/primitives.module.css",
    token: "border-inline-start: 1px solid var(--border-soft);",
    reason: "Drawer/panel boundary.",
  },
  {
    path: "components/marketing/features/mockups/research/ResearchDetailPanelMock.tsx",
    token: "border-r",
    reason: "Metric column separators.",
  },
  {
    path: "components/marketing/features/mockups/research/ResearchDetailPanelMock.tsx",
    token: "border-r-0",
    reason: "Removes the last metric column separator.",
  },
  {
    path: "components/marketing/features/mockups/settings/provider-budgets.module.css",
    token: "border-inline-start: 1px solid var(--border-soft);",
    reason: "Budget table column separators.",
  },
  {
    path: "components/marketing/landing/ByokSection.tsx",
    token: "border-r",
    reason: "Two-column section divider on desktop.",
  },
  {
    path: "components/marketing/landing/DxQuickstart.tsx",
    token: "border-l",
    reason: "Two-column section divider on desktop.",
  },
  {
    path: "components/marketing/landing/FeaturesTeaser.tsx",
    token: "border-l",
    reason: "Two-column section divider on desktop.",
  },
  {
    path: "components/marketing/landing/Hero.tsx",
    token: "border-r",
    reason: "Domain input prefix separator.",
  },
  {
    path: "components/marketing/landing/RankWindowCard.tsx",
    token: "border-l",
    count: 2,
    reason: "Rank metric column separators.",
  },
  {
    path: "components/onboarding/steps/StepCreateProject.tsx",
    token: "border-r",
    reason: "Domain input prefix separator.",
  },
  {
    path: "components/search-insights/SearchInsightsLoadingSkeletons.tsx",
    token: "border-l",
    reason: "Trust-strip metric column separators in the loading state.",
  },
  {
    path: "components/search-insights/SearchInsightsTrustStripPrimitives.tsx",
    token: "border-l",
    reason: "Trust-strip metric column separators.",
  },
  {
    path: "components/shell/MobileNav.tsx",
    token: 'borderRight: "1px solid var(--border)",',
    reason: "Navigation drawer edge.",
  },
  {
    path: "components/shell/ShellSkeleton.tsx",
    token: "border-r",
    reason: "Sidebar/workspace divider in the loading state.",
  },
  {
    path: "components/shell/Sidebar.stories.tsx",
    token: "border-l",
    reason: "Sidebar/workspace divider in the story layout.",
  },
  { path: "components/shell/Sidebar.tsx", token: "border-r", reason: "Sidebar/workspace divider." },
  {
    path: "components/ui/AppDrawer.tsx",
    token: "borderLeft: panelBorder,",
    reason: "Drawer/workspace boundary.",
  },
  {
    path: "components/ui/Sheet.tsx",
    token: 'borderLeft: isDesktop ? "1px solid var(--border)" : "none",',
    reason: "Desktop sheet/workspace boundary.",
  },
  {
    path: "components/usagekit/usage-overview-card.tsx",
    token: "border-l",
    count: 2,
    reason: "Summary/detail column separators at the wide container breakpoint.",
  },
  {
    path: "components/usagekit/usage-summary-cards.tsx",
    token: "border-e",
    count: 2,
    reason: "Responsive metric column separators.",
  },
  {
    path: "components/usagekit/usage-summary-cards.tsx",
    token: "border-e-0",
    count: 2,
    reason: "Removes metric separators at row ends.",
  },
];

it("bans side-border widths including responsive, logical and arbitrary utilities", () => {
  for (const side of ["l", "r", "s", "e"]) {
    for (const width of ["", "-0", "-1", "-2", "-4", "-[3px]", "-(length:--bar-width)"]) {
      const token = `border-${side}${width}`;
      expect(sideBorders(`<div className="sm:hover:${token}!" />`)).toEqual([token]);
    }
  }
  expect(sideBorders(".note { border-left: 3px solid green; }")).toEqual([
    "border-left: 3px solid green;",
  ]);
  expect(sideBorders('style={{ borderRight: "3px solid green", }}')).toEqual([
    'borderRight: "3px solid green",',
  ]);
  expect(sideBorders("border border-border border-t border-b-2 divide-x border-l-green")).toEqual(
    [],
  );
});

it("keeps every side border limited to explicit structural separators", () => {
  const paths = ["app", "components"].flatMap(sourceFiles);
  const violations: string[] = [];
  for (const path of paths) {
    const tokens = sideBorders(readFileSync(path, "utf8"));
    const allowed = separators.filter((entry) => entry.path === path);
    for (const entry of allowed) {
      expect(entry.reason.trim()).not.toBe("");
      expect(
        tokens.filter((token) => token === entry.token).length,
        `${path}: stale separator exception ${entry.token}`,
      ).toBe(entry.count ?? 1);
      for (let n = 0; n < (entry.count ?? 1); n++) tokens.splice(tokens.indexOf(entry.token), 1);
    }
    violations.push(...tokens.map((token) => `${path}: ${token}`));
  }
  expect(violations).toEqual([]);
});
