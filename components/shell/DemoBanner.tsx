"use client";

// `shell.demo` is serialized by the workspace shell's FeatureMessagesProvider, so the banner
// resolves it on the client: the shell renders it from a Server Component.

import { Button } from "@/components/ui/Button";
import { CLOUD_BETA_SIGNUP_HREF, MARKETING_URL } from "@/lib/site/site";
import { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";
import { useTranslations } from "next-intl";

type DemoBannerProps = {
  actor: "owner" | "viewer";
  capturedAt: string | null;
  mode: "editable" | "legacy-read-only";
};

export function DemoBanner({ actor, capturedAt, mode }: Readonly<DemoBannerProps>) {
  const t = useTranslations("shell.demo");
  const isEditable = mode === "editable";
  const message = isEditable
    ? actor === "owner"
      ? t("editableOwner.message")
      : t("editableViewer.message")
    : t("legacy.message");
  return (
    <div
      className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-bg-elev px-4 py-1 text-xs text-fg-muted"
      role="status"
    >
      <EyeIcon aria-hidden className="shrink-0 text-accent-text" size={17} weight="regular" />
      <p className="m-0 min-w-[180px] flex-1">
        <strong className="font-semibold text-fg">
          {isEditable && actor === "owner" ? t("editableOwner.title") : t("readOnlyTitle")}
        </strong>{" "}
        {message}
      </p>
      {!isEditable && capturedAt ? (
        <time dateTime={capturedAt}>{t("snapshot", { date: capturedAt.slice(0, 10) })}</time>
      ) : null}
      <Button className="shrink-0" href={`${MARKETING_URL}${CLOUD_BETA_SIGNUP_HREF}`} size="xs">
        {t("createAccount")}
      </Button>
    </div>
  );
}
