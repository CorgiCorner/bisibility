"use client";

import { SetupVideoPlayer } from "@/components/getting-started/SetupVideoPlayer";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { SETUP_VIDEO_MANIFEST } from "@/lib/getting-started/video-manifest";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { chatgptStarterPromptKey } from "./install-getting-started-copy";

const DISMISSAL_KEY = "bisibility:install:chatgpt-guide:v1";
const CHANGE_EVENT = "bisibility:install-guide-change";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISSAL_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export function InstallGettingStarted({
  hasKeywordAndCheck,
  mcpUrl,
}: Readonly<{ hasKeywordAndCheck: boolean; mcpUrl: string }>) {
  const t = useTranslations("projectInstall.gettingStarted");
  const storedDismissal = useSyncExternalStore(subscribe, isDismissed, () => false);
  const [localDismissal, setLocalDismissal] = useState<boolean | null>(null);
  const dismissed = localDismissal ?? storedDismissal;
  const video = SETUP_VIDEO_MANIFEST["connect-chatgpt"];

  function setDismissed(value: boolean) {
    try {
      if (value) window.localStorage.setItem(DISMISSAL_KEY, "dismissed");
      else window.localStorage.removeItem(DISMISSAL_KEY);
      setLocalDismissal(null);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Keep dismissal usable when browser storage is unavailable.
      setLocalDismissal(value);
    }
  }

  if (dismissed) {
    return (
      <Button className="mb-3" onClick={() => setDismissed(false)} size="xs" variant="ghost">
        {t("show")}
      </Button>
    );
  }

  return (
    <section
      aria-label={t("heading")}
      className="mb-3 rounded-card border border-border bg-bg-elev px-5 py-[18px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-semibold">{t("heading")}</h2>
          <p className="m-0 mt-1 text-[12.5px] text-fg-muted">{t("description")}</p>
        </div>
        <Button
          aria-label={t("dismiss")}
          onClick={() => setDismissed(true)}
          size="xs"
          variant="ghost"
        >
          <XIcon aria-hidden size={15} weight="regular" />
        </Button>
      </div>
      <div className={video ? "mt-4 grid gap-5 lg:grid-cols-2" : "mt-4"}>
        <ol
          className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3 lg:gap-5"
          style={video ? { gridTemplateColumns: "1fr" } : undefined}
        >
          <li>
            <h3 className="m-0 text-[12.5px] font-semibold">{t("developerMode.title")}</h3>
            <p className="m-0 mt-1 text-[12px] leading-relaxed text-fg-muted">
              {t("developerMode.description")}
            </p>
          </li>
          <li>
            <h3 className="m-0 text-[12.5px] font-semibold">{t("addApp.title")}</h3>
            <p className="m-0 mt-1 text-[12px] leading-relaxed text-fg-muted">
              {t("addApp.description")}
            </p>
            <div className="mt-2 flex min-w-0 items-center gap-1 rounded-control border border-border-control pl-2 pr-1">
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-muted">{mcpUrl}</span>
              <CopyButton label={t("addApp.copyMcpUrl")} size="sm" text={mcpUrl} />
            </div>
          </li>
          <li>
            <h3 className="m-0 text-[12.5px] font-semibold">{t("firstChat.title")}</h3>
            <p className="m-0 mt-1 text-[12px] leading-relaxed text-fg-muted">
              {t("firstChat.description", {
                prompt: t(`firstChat.prompt.${chatgptStarterPromptKey(hasKeywordAndCheck)}`),
              })}
            </p>
          </li>
        </ol>
        {video ? (
          <div className="min-w-0 self-start overflow-hidden rounded-control">
            <SetupVideoPlayer videoRef="connect-chatgpt" />
          </div>
        ) : null}
      </div>
      <p className="m-0 mt-4 text-[11.5px] text-fg-muted">
        {t("note")}{" "}
        <a
          className="text-accent-text underline underline-offset-2"
          href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
          rel="noreferrer noopener"
          target="_blank"
        >
          {t("guideLink")}
        </a>
      </p>
    </section>
  );
}
