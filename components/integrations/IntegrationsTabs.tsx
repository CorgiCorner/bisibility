"use client";

import { Tabs } from "@/components/ui/Tabs";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function IntegrationsTabs({
  active,
  projectRef,
}: Readonly<{
  active: "connections" | "usage";
  projectRef: string;
}>) {
  const router = useRouter();
  const t = useTranslations("projectIntegrations.tabs");
  return (
    <div className="border-b border-border">
      <Tabs
        ariaLabel={t("aria")}
        onChange={(tab) =>
          router.push(
            `${appPath(projectRef, "integrations")}${tab === "usage" ? "?tab=usage" : ""}`,
          )
        }
        options={[
          { label: t("connections"), value: "connections" },
          { label: t("usage"), value: "usage" },
        ]}
        panelId="integrations-panel"
        value={active}
      />
    </div>
  );
}
