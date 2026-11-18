"use client";

import { Button } from "@/components/ui/Button";
import { appPath } from "@/lib/routing/app-path";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { useTranslations } from "next-intl";

/** Configuration guidance replaces a composer that cannot accept a question yet. */
export function AssistantSetupState({
  project,
  canManage = false,
  checking,
  onCheck,
}: Readonly<{
  project: string;
  canManage?: boolean;
  checking: boolean;
  onCheck: () => void;
}>) {
  const t = useTranslations("assistant.setup");
  const providers = appPath(project, "providers");
  const steps = [
    {
      title: t("connectTitle"),
      description: t(canManage ? "connectDescription" : "memberConnectDescription"),
      action: (
        <Button href={`${providers}#assistant-funding`} size="input" variant="outline">
          {t("connectAction")}
        </Button>
      ),
    },
    {
      title: t("limitsTitle"),
      description: t(canManage ? "limitsDescription" : "memberLimitsDescription"),
      action: (
        <Button href={appPath(project, "usage")} size="input" variant="outline">
          {t("limitsAction")}
        </Button>
      ),
    },
    {
      title: t("startTitle"),
      description: t("startDescription"),
      action: (
        <Button disabled={checking} loading={checking} onClick={onCheck} size="input">
          {t("startAction")}
        </Button>
      ),
    },
  ];
  return (
    <section
      aria-label={t("title")}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6"
      data-assistant-setup
    >
      <div className="mx-auto grid w-full max-w-md gap-6">
        <div className="grid justify-items-start gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-bg-sunken text-fg-muted">
            <ChatCircleDotsIcon aria-hidden size={22} weight="regular" />
          </span>
          <h3 className="m-0 text-ui-section">{t("title")}</h3>
          <p className="m-0 text-ui-body text-fg-muted">{t("description")}</p>
        </div>
        <ol className="m-0 grid list-none gap-6 p-0">
          {steps.map((step, index) => (
            <li
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3"
              key={step.title}
            >
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-full bg-bg-sunken text-ui-caption font-semibold"
              >
                {index + 1}
              </span>
              <div className="grid min-w-0 justify-items-start gap-2">
                <h4 className="m-0 text-ui-body font-semibold">{step.title}</h4>
                <p className="m-0 text-ui-caption text-fg-muted">{step.description}</p>
                {step.action}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
