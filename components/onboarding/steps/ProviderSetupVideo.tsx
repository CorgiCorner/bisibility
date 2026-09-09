"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/csr/PlayCircle";
import { useState } from "react";
import type { OnboardingSerpProviderId } from "./StepConnectProvider.fields";

const providerVideos = {
  dataforseo: {
    id: "QBCtJU5bRAY",
    title: "DataForSEO account setup",
    description: "Create an account, find your API credentials, and verify your account.",
  },
  serpapi: {
    id: "cMSk7FRIzdM",
    title: "SerpApi account setup",
    description: "Create an account and find your API key.",
  },
} satisfies Record<OnboardingSerpProviderId, { id: string; title: string; description: string }>;

export function ProviderSetupVideo({
  providerId,
}: Readonly<{ providerId: OnboardingSerpProviderId }>) {
  const [open, setOpen] = useState(false);
  const video = providerVideos[providerId];

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="xs"
        startIcon={<PlayCircleIcon aria-hidden size={16} weight="regular" />}
        type="button"
        variant="ghost"
      >
        Watch setup guide
      </Button>
      <Modal
        description={video.description}
        onClose={() => setOpen(false)}
        open={open}
        title={video.title}
        width={840}
      >
        {open ? (
          <iframe
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="block aspect-video w-full rounded-control border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0`}
            title={video.title}
          />
        ) : null}
      </Modal>
    </>
  );
}
