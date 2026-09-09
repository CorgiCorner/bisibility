import { SETUP_VIDEO_MANIFEST, type SetupVideoRef } from "@/lib/getting-started/video-manifest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

const publishedVideos = { ...SETUP_VIDEO_MANIFEST };

afterEach(() => {
  for (const videoRef of [
    "create-project",
    "connect-source",
    "add-keywords",
    "first-check",
  ] satisfies SetupVideoRef[]) {
    delete SETUP_VIDEO_MANIFEST[videoRef];
  }
  Object.assign(SETUP_VIDEO_MANIFEST, publishedVideos);
});

const setupVideos = [
  { label: "Watch setup video", step: 1, title: "Website", videoRef: "create-project" },
  { label: "Watch provider setup", step: 2, title: "Provider", videoRef: "connect-source" },
  { label: "Watch setup video", step: 3, title: "Keywords", videoRef: "add-keywords" },
  { label: "Watch setup video", step: 4, title: "First check", videoRef: "first-check" },
] as const satisfies ReadonlyArray<{
  label: string;
  step: 1 | 2 | 3 | 4;
  title: string;
  videoRef: SetupVideoRef;
}>;

function wizardPropsForStep(step: 1 | 2 | 3 | 4) {
  return step === 1
    ? { initialStep: step }
    : {
        initialFlowState: { projectId: "prj_1", providerId: null },
        initialProject: project,
        initialStep: step,
      };
}

describe("OnboardingWizard setup videos", () => {
  it("omits setup-video actions in each real wizard step while the manifest is empty", () => {
    for (const { videoRef } of setupVideos) {
      delete SETUP_VIDEO_MANIFEST[videoRef];
    }
    for (const initialStep of [1, 2, 3, 4] as const) {
      const { unmount } = renderWizard(wizardPropsForStep(initialStep));

      expect(screen.queryByRole("button", { name: "Watch setup video" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Watch provider setup" }),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the action beside the step counter and the full card below the header", () => {
    SETUP_VIDEO_MANIFEST["create-project"] = {
      durationSeconds: 12,
      width: 1728,
      height: 1080,
      poster: "/videos/setup/create-project.jpg",
      src: "/videos/setup/create-project.mp4",
    };
    renderWizard();

    const stepHeader = screen.getByTestId("onboarding-step-header");
    const action = within(stepHeader).getByRole("button", { name: "Watch setup video" });
    const websiteInput = screen.getByRole("textbox", { name: "Your website" });
    const card = websiteInput.closest("section");

    if (!card) throw new Error("Expected the website input to remain inside the onboarding card.");

    expect(within(stepHeader).getByText("Step 1 of 4")).toBeVisible();
    expect(stepHeader.children).toHaveLength(2);
    expect(stepHeader.lastElementChild).toBe(action);
    expect(
      within(stepHeader).queryByRole("textbox", { name: "Your website" }),
    ).not.toBeInTheDocument();
    expect(stepHeader.compareDocumentPosition(card)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(card).toHaveClass("rounded-card", "border", "bg-bg-elev");
    expect(card).toContainElement(websiteInput);
  });

  it("opens each published setup video with its step title and provider-specific label", async () => {
    const user = userEvent.setup();
    for (const { videoRef } of setupVideos) {
      SETUP_VIDEO_MANIFEST[videoRef] = {
        durationSeconds: 12,
        width: 1728,
        height: 1080,
        poster: `/videos/setup/${videoRef}.jpg`,
        src: `/videos/setup/${videoRef}.mp4`,
      };
    }

    for (const { label, step, title, videoRef } of setupVideos) {
      const { unmount } = renderWizard(wizardPropsForStep(step));
      const stepHeader = screen.getByTestId("onboarding-step-header");
      const button = within(stepHeader).getByRole("button", { name: label });

      expect(within(stepHeader).getByText(`Step ${step} of 4`)).toBeVisible();
      await user.click(button);

      const dialog = await screen.findByRole("dialog", { name: title });
      expect(dialog).toBeVisible();
      expect(dialog.querySelector("video")).toHaveAttribute("data-video-ref", videoRef);
      unmount();
    }
  });
});
