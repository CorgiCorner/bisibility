"use client";

import { Modal } from "@/components/ui/Modal";
import { SETUP_VIDEO_MANIFEST, type SetupVideoRef } from "@/lib/getting-started/video-manifest";
import { SetupVideoPlayer } from "./SetupVideoPlayer";

export function SetupVideoModal({
  open,
  onClose,
  title,
  videoRef,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  title: string;
  videoRef: SetupVideoRef;
}>) {
  const video = SETUP_VIDEO_MANIFEST[videoRef];
  if (!video) return null;
  return (
    <Modal onClose={onClose} open={open} size="lg" title={title}>
      {open ? <SetupVideoPlayer videoRef={videoRef} /> : null}
    </Modal>
  );
}
