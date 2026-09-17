import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import Image from "next/image";
import { useTranslations } from "next-intl";

export const CHATGPT_ICON = {
  path: "/bisibility-mcp-icon.png",
  bytes: 2391,
  width: 256,
  height: 256,
} as const;

export function ChatGptIconDownload({ origin }: Readonly<{ origin: string }>) {
  const t = useTranslations("projectInstall.chatgptIcon");
  const iconUrl = new URL(CHATGPT_ICON.path, origin).href;
  return (
    <section className="mb-3 rounded-card border border-border bg-bg-elev px-5 py-[18px]">
      <div className="flex items-center gap-4">
        <Image
          alt={t("imageAlt")}
          className="shrink-0 rounded-control border border-border"
          height={56}
          src={CHATGPT_ICON.path}
          unoptimized
          width={56}
        />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-semibold">{t("heading")}</h2>
          <p className="m-0 mt-1 text-[12.5px] text-fg-muted">{t("description")}</p>
          <p className="m-0 mt-1 text-[11.5px] text-fg-muted">
            {t("meta", {
              bytes: CHATGPT_ICON.bytes,
              height: CHATGPT_ICON.height,
              kilobytes: (CHATGPT_ICON.bytes / 1000).toFixed(2),
              width: CHATGPT_ICON.width,
            })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          download="bisibility-mcp-icon.png"
          href={CHATGPT_ICON.path}
          size="sm"
          variant="secondary"
          startIcon={<DownloadSimpleIcon aria-hidden size={15} weight="regular" />}
        >
          {t("download")}
        </Button>
        <div className="flex min-w-0 flex-1 basis-[240px] items-center gap-1 rounded-control border border-border-control pl-3 pr-1">
          <a
            className="min-w-0 flex-1 truncate text-[12px] text-fg-muted hover:text-fg hover:underline"
            href={iconUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            {iconUrl}
          </a>
          <CopyButton label={t("copyUrl")} size="sm" text={iconUrl} />
        </div>
      </div>
    </section>
  );
}
