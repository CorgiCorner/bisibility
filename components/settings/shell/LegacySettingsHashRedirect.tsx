"use client";

import {
  resolveLegacySettingsHash,
  settingsSectionHref,
} from "@/components/settings/shell/settings-sections";
import type { ProjectRef } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

type LegacySettingsHashRedirectProps = {
  projectRef: ProjectRef;
};

export function LegacySettingsHashRedirect({
  projectRef,
}: Readonly<LegacySettingsHashRedirectProps>) {
  const router = useRouter();
  const handleMount = useCallback(
    (element: HTMLSpanElement | null) => {
      if (!element) return;

      const section = resolveLegacySettingsHash(window.location.hash);
      if (!section) return;

      const destination = settingsSectionHref(projectRef, section);
      if (window.location.pathname !== destination) router.replace(destination);
    },
    [projectRef, router],
  );

  return <span aria-hidden data-settings-legacy-hash-map="" ref={handleMount} />;
}
