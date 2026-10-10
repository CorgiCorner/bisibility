"use client";

import { useAgentWorkspaceAccess } from "@/components/agent-reports/AgentWorkspaceAccessProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Textarea } from "@/components/ui/Textarea";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const fields = ["business", "audience", "products", "goals", "agentRules"] as const;

export function ProjectContextLayout({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations("agentWorkspace");
  return (
    <Card size="lg">
      <SectionTitle>{t("contextTitle")}</SectionTitle>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{t("contextDescription")}</p>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function ProjectContextFields({
  children,
}: Readonly<{ children: (field: (typeof fields)[number]) => ReactNode }>) {
  const t = useTranslations("agentWorkspace");
  return fields.map((field) => (
    <div className="grid gap-2" key={field}>
      <label className="text-[13px] font-semibold" htmlFor={`context-${field}`}>
        {t(field)}
      </label>
      <p className="text-[12px] text-fg-muted" id={`context-${field}-hint`}>
        {t(`${field}Hint`)}
      </p>
      {children(field)}
    </div>
  ));
}

export function ProjectContextFooter({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">{children}</div>
  );
}

export function ProjectContextLoading() {
  const t = useTranslations("agentWorkspace");
  const { canEdit } = useAgentWorkspaceAccess();
  return (
    <div aria-hidden>
      <ProjectContextLayout>
        <div className="grid gap-5">
          <ProjectContextFields>
            {(field) => (
              <Textarea
                aria-describedby={`context-${field}-hint`}
                className="bg-bg-sunken motion-safe:animate-pulse"
                disabled
                id={`context-${field}`}
              />
            )}
          </ProjectContextFields>
          <ProjectContextFooter>
            {canEdit ? (
              <Button
                disabled
                tabIndex={-1}
                className="text-transparent bg-bg-sunken motion-safe:animate-pulse"
              >
                {t("save")}
              </Button>
            ) : (
              <p className="text-[13px] text-fg-muted">{t("readOnly")}</p>
            )}
          </ProjectContextFooter>
        </div>
      </ProjectContextLayout>
    </div>
  );
}
