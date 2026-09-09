import { track } from "@/lib/analytics/client";
import { SETUP_VIDEO_MANIFEST } from "@/lib/getting-started/video-manifest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchSetupVideoLink } from "./WatchSetupVideoLink";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const publishedVideos = { ...SETUP_VIDEO_MANIFEST };

afterEach(() => {
  delete SETUP_VIDEO_MANIFEST["create-project"];
  Object.assign(SETUP_VIDEO_MANIFEST, publishedVideos);
  vi.mocked(track).mockClear();
});

describe("WatchSetupVideoLink", () => {
  it("hides unavailable clips and opens published clips with their analytics event", async () => {
    delete SETUP_VIDEO_MANIFEST["create-project"];
    const user = userEvent.setup();
    const props = { step: 1 as const, title: "Website", videoRef: "create-project" as const };
    const { rerender } = render(<WatchSetupVideoLink {...props} />);

    expect(screen.queryByRole("button", { name: "Watch setup video" })).not.toBeInTheDocument();

    SETUP_VIDEO_MANIFEST["create-project"] = {
      durationSeconds: 12,
      width: 1728,
      height: 1080,
      poster: "/videos/setup/create-project.jpg",
      src: "/videos/setup/create-project.mp4",
    };
    rerender(<WatchSetupVideoLink {...props} />);
    await user.click(screen.getByRole("button", { name: "Watch setup video" }));

    expect(track).toHaveBeenCalledWith("setup_video_opened", { step: "create_project" });
    const dialog = await screen.findByRole("dialog", { name: "Website" });
    expect(dialog).toBeVisible();
    expect(dialog.querySelector("video")).toHaveAttribute("data-video-ref", "create-project");
  });
});
