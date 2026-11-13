"use client";

import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/toast-context";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverOrigin = () => "";
const clientOrigin = () => window.location.origin;

export function PublicReportShare({ title, token }: Readonly<{ title: string; token: string }>) {
  const t = useTranslations("challengeReport.share");
  const { showToast } = useToast();
  const origin = useSyncExternalStore(subscribe, clientOrigin, serverOrigin);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const pageUrl = origin ? `${origin}/r/${token}` : "";
  const imageUrl = `/r/${token}/image?theme=${theme}`;
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="m-0 text-ui-section">{t("shareResult")}</h2>
        <p className="m-0 text-ui-caption text-fg-muted">{t("onlyYou")}</p>
        <p className="m-0 text-ui-caption text-fg-muted">{t("shareResultHelp")}</p>
      </div>
      {/* biome-ignore lint/performance/noImgElement: the share card is a same-origin generated image, not a static asset. */}
      <img alt={t("imageAlt", { title })} className="h-auto w-full" src={imageUrl} />
      <SegmentedControl
        ariaLabel={t("theme")}
        onChange={setTheme}
        options={[
          { label: t("themeLight"), value: "light" },
          { label: t("themeDark"), value: "dark" },
        ]}
        value={theme}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!pageUrl}
          onClick={() => {
            void navigator.clipboard.writeText(pageUrl);
            showToast(t("linkCopied"), { severity: "success" });
          }}
          type="button"
          variant="secondary"
        >
          {t("copyLink")}
        </Button>
        <Button
          href={
            pageUrl
              ? `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}`
              : undefined
          }
          rel="noreferrer"
          target="_blank"
          variant="secondary"
        >
          {t("postX")}
        </Button>
        <Button
          href={
            pageUrl
              ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`
              : undefined
          }
          rel="noreferrer"
          target="_blank"
          variant="secondary"
        >
          {t("postLinkedIn")}
        </Button>
        <Button href={`${imageUrl}&download=1`} variant="secondary">
          {t("download")}
        </Button>
      </div>
    </section>
  );
}
