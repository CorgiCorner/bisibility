import { track } from "@/lib/analytics/client";
import { SETUP_VIDEO_MANIFEST } from "@/lib/getting-started/video-manifest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoWalkthrough } from "./VideoWalkthrough";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

const publishedVideo = SETUP_VIDEO_MANIFEST["create-project"];

beforeEach(() => {
  delete SETUP_VIDEO_MANIFEST["create-project"];
});

afterEach(() => {
  SETUP_VIDEO_MANIFEST["create-project"] = publishedVideo;
  vi.mocked(track).mockClear();
});

describe("VideoWalkthrough", () => {
  it("keeps only the written-version note when no clip is published", () => {
    render(<VideoWalkthrough step="create_project" videoRef="create-project" />);

    const walkthrough = screen.getByRole("region", { name: "Video walkthrough" });
    expect(walkthrough).toHaveAttribute("data-video-ref", "create-project");
    expect(within(walkthrough).queryByText("Coming soon")).not.toBeInTheDocument();
    expect(
      within(walkthrough).getByText(
        "Each step opens with its written version. Clips appear here as they are published.",
      ),
    ).toBeVisible();
    expect(walkthrough.querySelector("video")).toBeNull();
  });

  it("shows the poster without preloading a published clip", () => {
    SETUP_VIDEO_MANIFEST["create-project"] = {
      durationSeconds: 12,
      width: 1728,
      height: 1080,
      poster: "/videos/setup/create-project.jpg",
      src: "/videos/setup/create-project.mp4",
    };
    render(<VideoWalkthrough step="create_project" videoRef="create-project" />);

    const video = screen.getByTestId("setup-video") as HTMLVideoElement;
    expect(video).toHaveAttribute("src", "/videos/setup/create-project.mp4");
    expect(video).toHaveAttribute("poster", "/videos/setup/create-project.jpg");
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("controls");
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    fireEvent.play(video);
    expect(track).toHaveBeenCalledWith("setup_video_opened", { step: "create_project" });
  });
});
