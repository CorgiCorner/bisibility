"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/csr/PlayCircle";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { OnboardingSerpProviderId } from "./StepConnectProvider.fields";

const providerVideos = {
  dataforseo: {
    id: "QBCtJU5bRAY",
  },
  serpapi: {
    id: "cMSk7FRIzdM",
  },
} satisfies Record<OnboardingSerpProviderId, { id: string }>;

export function ProviderSetupVideo({
  providerId,
}: Readonly<{ providerId: OnboardingSerpProviderId }>) {
  const t = useTranslations("onboarding.provider.video");
  const [open, setOpen] = useState(false);
  const video = providerVideos[providerId];
  const title = t(`${providerId}.title`);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="xs"
        startIcon={<PlayCircleIcon aria-hidden size={16} weight="regular" />}
        type="button"
        variant="ghost"
      >
        {t("watch")}
      </Button>
      <Modal
        description={t(`${providerId}.description`)}
        onClose={() => setOpen(false)}
        open={open}
        title={title}
        width={840}
      >
        {open ? (
          <iframe
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="block aspect-video w-full rounded-control border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0`}
            title={title}
          />
        ) : null}
      </Modal>
    </>
  );
}
