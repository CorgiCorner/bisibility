"use client";

import { SetupVideoModal } from "@/components/getting-started/SetupVideoModal";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics/client";
import { SETUP_VIDEO_MANIFEST, type SetupVideoRef } from "@/lib/getting-started/video-manifest";
import { useState } from "react";

declare module "@/lib/analytics/client" {
  interface AnalyticsEventRegistry {
    setup_video_opened: true;
  }
}

type WatchSetupVideoLinkProps = {
  step: 1 | 2 | 3 | 4;
  title: string;
  videoRef: SetupVideoRef;
};

const setupStepIds = {
  1: "create_project",
  2: "connect_source",
  3: "add_keywords",
  4: "first_check",
} as const;

export function WatchSetupVideoLink({ step, title, videoRef }: Readonly<WatchSetupVideoLinkProps>) {
  const [open, setOpen] = useState(false);
  const video = SETUP_VIDEO_MANIFEST[videoRef];
  const label = step === 2 ? "Watch provider setup" : "Watch setup video";
  if (!video) return null;

  function showVideo() {
    track("setup_video_opened", { step: setupStepIds[step] });
    setOpen(true);
  }

  return (
    <>
      <Button onClick={showVideo} size="xs" type="button" variant="ghost">
        {label}
      </Button>
      <SetupVideoModal
        onClose={() => setOpen(false)}
        open={open}
        title={title}
        videoRef={videoRef}
      />
    </>
  );
}
