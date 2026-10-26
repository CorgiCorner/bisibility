"use client";

import { Tabs } from "@/components/ui/Tabs";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function IntegrationsTabs({
  active,
  projectRef,
  showCredits = true,
}: Readonly<{
  active: "connections" | "usage" | "byok";
  projectRef: string;
  showCredits?: boolean;
}>) {
  const router = useRouter();
  const t = useTranslations("projectIntegrations.tabs");
  return (
    <div className="min-w-0 overflow-x-auto border-b border-border">
      <Tabs
        ariaLabel={t("aria")}
        onChange={(tab) =>
          router.push(
            `${appPath(projectRef, "integrations")}${tab === "connections" ? "" : `?tab=${tab}`}`,
          )
        }
        options={[
          { label: t("connections"), value: "connections" },
          ...(showCredits ? [{ label: t("creditsUsage"), value: "usage" }] : []),
          { label: t("byokUsage"), value: "byok" },
        ]}
        panelId="integrations-panel"
        value={active}
      />
    </div>
  );
}
