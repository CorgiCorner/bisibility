"use client";

import { SETUP_VIDEO_MANIFEST, type SetupVideoRef } from "@/lib/getting-started/video-manifest";

export function SetupVideoPlayer({
  onPlay,
  videoRef,
}: Readonly<{ onPlay?: () => void; videoRef: SetupVideoRef }>) {
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
      Your browser does not support video. <a href={video.src}>Open the video</a>.
    </video>
  );
}
