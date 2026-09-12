"use client";

import { Tabs } from "@/components/ui/Tabs";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";

export function IntegrationsTabs({
  active,
  projectRef,
}: Readonly<{
  active: "connections" | "usage";
  projectRef: string;
}>) {
  const router = useRouter();
  return (
    <div className="border-b border-border">
      <Tabs
        ariaLabel="Integrations sections"
        onChange={(tab) =>
          router.push(
            `${appPath(projectRef, "integrations")}${tab === "usage" ? "?tab=usage" : ""}`,
          )
        }
        options={[
          { label: "Connections", value: "connections" },
          { label: "Usage", value: "usage" },
        ]}
        panelId="integrations-panel"
        value={active}
      />
    </div>
  );
}
