"use client";

import { track } from "@/lib/analytics/client";
import type { SetupStepId } from "@/lib/getting-started/setup-steps";
import { SETUP_VIDEO_MANIFEST, type SetupVideoRef } from "@/lib/getting-started/video-manifest";
import { SetupVideoPlayer } from "./SetupVideoPlayer";

type VideoWalkthroughProps = {
  step: SetupStepId;
  videoRef: SetupVideoRef;
};

export function VideoWalkthrough({ step, videoRef }: Readonly<VideoWalkthroughProps>) {
  const video = SETUP_VIDEO_MANIFEST[videoRef];

  return (
    <section
      aria-label="Video walkthrough"
      className={
        video
          ? "min-w-0 w-full overflow-hidden rounded-card border border-border bg-bg-sunken"
          : "flex aspect-video min-h-[260px] w-full items-center rounded-card border border-dashed border-border-control bg-bg-sunken px-5 py-[22px] text-center"
      }
      data-video-ref={videoRef}
    >
      {video ? (
        <SetupVideoPlayer
          onPlay={() => track("setup_video_opened", { step })}
          videoRef={videoRef}
        />
      ) : (
        <div className="mx-auto max-w-[440px]">
          <h3 className="m-0 text-[16px] font-semibold text-fg">Video walkthroughs</h3>
          <p className="m-0 mt-2 text-[13px] leading-[1.55] text-fg-muted">
            Each step opens with its written version. Clips appear here as they are published.
          </p>
        </div>
      )}
    </section>
  );
}
