import { composeStories } from "@storybook/react";
import { within } from "@testing-library/dom";
import { expect } from "storybook/test";
import { describe, it } from "vitest";
import preview from "../.storybook/preview";
import * as advancedStories from "../components/settings/advanced/AdvancedSettingsContent.stories";
import * as dataSourcesStories from "../components/settings/data-sources/DataSourcesSettingsContent.stories";
import * as developersStories from "../components/settings/developers/DevelopersSettingsContent.stories";
import * as notificationStories from "../components/settings/notifications/NotificationPreferences.stories";
import * as teamStories from "../components/settings/team/TeamSettingsContent.stories";
import * as trackingStories from "../components/settings/tracking/TrackingSettingsContent.stories";

type StoryRunner = {
  load: () => Promise<unknown>;
  run: (input: { canvasElement: HTMLElement }) => Promise<unknown>;
};

function composeSettingsStory(stories: object, storyName: string): StoryRunner {
  const composed = composeStories(
    stories as Parameters<typeof composeStories>[0],
    preview,
  ) as unknown as Record<string, StoryRunner>;
  const story = composed[storyName];
  if (!story) throw new Error(`Missing composed story: ${storyName}`);
  return story;
}

const settingsShellStories = [
  {
    activeSection: "Advanced",
    name: "Advanced state with the shell provider",
    saveControl: "absent",
    sectionId: "advanced",
    story: composeSettingsStory(advancedStories, "StateDomainSet"),
  },
  {
    activeSection: "Developers",
    name: "Developers state with the shell provider",
    saveControl: "absent",
    sectionId: "developers",
    story: composeSettingsStory(developersStories, "StateWithKeys"),
  },
  {
    activeSection: "Data sources",
    name: "Data sources state with the shell provider",
    saveControl: "present",
    sectionId: "data-sources",
    story: composeSettingsStory(dataSourcesStories, "NoQuotaPause"),
  },
  {
    activeSection: "Notifications",
    name: "Notification preferences with the shell provider",
    saveControl: "absent",
    sectionId: "notifications",
    story: composeSettingsStory(notificationStories, "Settled"),
  },
  {
    activeSection: "Team",
    name: "Team state with the shell provider",
    saveControl: "absent",
    sectionId: "team",
    story: composeSettingsStory(teamStories, "Settled"),
  },
  {
    activeSection: "Tracking",
    name: "Tracking state with the shell provider",
    saveControl: "present",
    sectionId: "tracking",
    story: composeSettingsStory(trackingStories, "Settled"),
  },
] as const;

describe("Settings shell composed stories", () => {
  it.each(settingsShellStories)(
    "renders $name through the real preview",
    async ({ activeSection, saveControl, sectionId, story }) => {
      const canvasElement = document.createElement("div");
      document.body.appendChild(canvasElement);

      try {
        await story.run({ canvasElement });

        const canvas = within(canvasElement);
        const navigation = canvasElement.querySelector<HTMLElement>("[data-settings-subnav]");
        expect(navigation).toHaveAttribute("aria-label", "Settings sections");
        const activeLink = navigation?.querySelector(`[data-settings-subnav-link="${sectionId}"]`);
        expect(activeLink).toHaveTextContent(activeSection);
        expect(activeLink).toHaveAttribute("aria-current", "page");
        expect(canvasElement.textContent).not.toContain("MISSING_MESSAGE");
        expect(canvasElement.textContent).not.toContain("projectSettingsShell.");

        if (saveControl === "present") {
          const saveControls = canvas.getAllByRole("button", { name: "Save" });
          expect(saveControls.length).toBeGreaterThan(0);
          for (const saveControl of saveControls) expect(saveControl).toBeVisible();
        } else {
          expect(canvas.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
        }
      } finally {
        await story.load();
        canvasElement.remove();
      }
    },
  );
});
