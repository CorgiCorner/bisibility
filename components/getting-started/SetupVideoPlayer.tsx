"use client";

import { SETUP_VIDEO_MANIFEST, type SetupVideoRef } from "@/lib/getting-started/video-manifest";
import { useTranslations } from "next-intl";

export function SetupVideoPlayer({
  onPlay,
  videoRef,
}: Readonly<{ onPlay?: () => void; videoRef: SetupVideoRef }>) {
  // The player mounts inside the marketing, onboarding and getting-started boundaries, so
  // its copy lives in the shared namespace every one of those boundaries loads.
  const t = useTranslations("shared.setupVideo");
  const video = SETUP_VIDEO_MANIFEST[videoRef];
  if (!video) return null;
  return (
    <video
      key={video.src}
      className="block h-auto w-full rounded-control"
      controls
      data-testid="setup-video"
      data-video-ref={videoRef}
      height={video.height}
      width={video.width}
      muted
      onPlay={onPlay}
      playsInline
      poster={video.poster}
      preload="none"
      src={video.src}
    >
      {t("fallback")} <a href={video.src}>{t("open")}</a>.
    </video>
  );
}
