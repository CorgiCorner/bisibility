import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { TrackingScheduleListItem } from "@/lib/ai-tracking/projections/schedule-list";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiScheduleDrawerHost } from "./AiScheduleDrawerHost";
import { trackingWorkspaceFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), preview: vi.fn(), catalog: vi.fn() }));
vi.mock("@/lib/actions/ai-tracking", () => ({
  mutateAiTrackingAction: mocks.mutate,
  previewAiTrackingAction: mocks.preview,
}));
vi.mock("@/lib/actions/ai-research", () => ({ getAiResearchCatalogAction: mocks.catalog }));

const saved: TrackingScheduleListItem = {
  ...trackingWorkspaceFixture.schedules[0],
  archivedAt: null,
  configurations: trackingWorkspaceFixture.schedules[0].configurations ?? [],
  nextRunAt: null,
  promptIds: ["aip_neutral"],
};
const preview = {
  configurations: saved.configurations,
  credentialConnectionId: "apc_fixture",
  credentialVersion: "credential_1",
  budgetRevision: "budget_1",
  consentRevision: "consent_1",
  estimatedCostCents: 1.2,
};

function host(props: Partial<ComponentProps<typeof AiScheduleDrawerHost>> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <FeatureMessagesProvider locale="en" messages={{ ...shared, ...tracking }} timeZone="UTC">
      <AiScheduleDrawerHost
        activePromptIds={["aip_neutral", "aip_branded"]}
        onClose={onClose}
        onSaved={onSaved}
        projectId="prj_story"
        schedules={[saved]}
        target="ais_weekly"
        {...props}
      />
    </FeatureMessagesProvider>,
  );
  return { onClose, onSaved };
}

describe("AiScheduleDrawerHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutate.mockResolvedValue(trackingWorkspaceFixture);
    mocks.preview.mockResolvedValue({ ok: true, value: preview });
  });

  it("opens a disabled schedule without any mutation and forces review when enabling", async () => {
    const user = userEvent.setup();
    host();
    const dialog = screen.getByRole("dialog");
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Enable this schedule after approval" }),
    );
    expect(within(dialog).queryByRole("button", { name: "Save schedule" })).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Preview configuration and cost" }),
    ).toBeVisible();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("requires preview and explicit consent, then saves every frozen configuration key", async () => {
    const user = userEvent.setup();
    const { onSaved } = host();
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Enable this schedule after approval" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Preview configuration and cost" }),
    );
    const save = await within(dialog).findByRole("button", { name: "Save schedule" });
    expect(mocks.preview).toHaveBeenCalledWith("prj_story", {
      promptIds: ["aip_neutral"],
      configurations: expect.any(Array),
    });
    expect(save).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "I approve this run and the provider actual cost",
      }),
    );
    await user.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.mutate).toHaveBeenCalledWith(
      "prj_story",
      "schedules",
      "PATCH",
      {
        name: saved.name,
        cron: saved.cron,
        timezone: saved.timezone,
        enabled: true,
        consent: true,
        configuration: {
          ...preview,
          promptIds: ["aip_neutral"],
          idempotencyKey: expect.any(String),
          origin: "manual",
          entrySource: "app",
          deadline: expect.any(String),
        },
      },
      "ais_weekly",
    );
  });

  it("creates a new schedule from active prompts without a member id", async () => {
    const user = userEvent.setup();
    host({ target: "new" });
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Preview configuration and cost" }),
    );
    await user.click(await within(dialog).findByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce());
    expect(mocks.preview).toHaveBeenCalledWith("prj_story", {
      promptIds: ["aip_neutral", "aip_branded"],
      configurations: expect.any(Array),
    });
    expect(mocks.mutate).toHaveBeenCalledWith(
      "prj_story",
      "schedules",
      "POST",
      expect.objectContaining({
        enabled: false,
        consent: false,
        configuration: expect.objectContaining({ promptIds: ["aip_neutral", "aip_branded"] }),
      }),
      undefined,
    );
  });

  it("surfaces a server rejection and stays open", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new Error("Explicit budget consent is required."));
    const { onSaved } = host();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/1 saved prompts/)).toBeVisible();
    expect(within(dialog).getByText(/consumer_scrape.*Poland/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Save schedule" }));
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Explicit budget consent is required.",
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      "prj_story",
      "schedules",
      "PATCH",
      { name: saved.name, cron: saved.cron, timezone: saved.timezone, enabled: false },
      "ais_weekly",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("resets consent when a reviewed configuration changes", async () => {
    const user = userEvent.setup();
    host();
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Enable this schedule after approval" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Preview configuration and cost" }),
    );
    await user.click(
      await within(dialog).findByRole("checkbox", {
        name: "I approve this run and the provider actual cost",
      }),
    );
    expect(within(dialog).getByRole("button", { name: "Save schedule" })).toBeEnabled();
    await user.type(within(dialog).getByLabelText("Schedule name"), " revised");
    expect(
      within(dialog).queryByRole("checkbox", {
        name: "I approve this run and the provider actual cost",
      }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Preview configuration and cost" }),
    );
    expect(
      await within(dialog).findByRole("checkbox", {
        name: "I approve this run and the provider actual cost",
      }),
    ).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Save schedule" })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("does not preview an empty active prompt scope", () => {
    host({ target: "new", activePromptIds: [] });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Preview configuration and cost" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Add or activate a prompt");
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("renders nothing for an unknown or archived schedule", () => {
    host({ schedules: [{ ...saved, archivedAt: "2026-10-01T00:00:00.000Z" }] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
