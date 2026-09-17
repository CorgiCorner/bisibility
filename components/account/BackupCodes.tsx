"use client";

import { Button } from "@/components/ui/Button";
import { downloadTextFile } from "@/lib/ui/download";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/csr/Key";
import { useTranslations } from "next-intl";

const RECOVERY_CODES_FILENAME = "bisibility_recovery_codes.txt";

function downloadRecoveryCodes(codes: readonly string[]) {
  downloadTextFile(`${codes.join("\n")}\n`, RECOVERY_CODES_FILENAME, "text/plain;charset=utf-8");
}

export function BackupCodes({ codes }: Readonly<{ codes: readonly string[] }>) {
  const t = useTranslations("account.security.backupCodes");
  if (!codes.length) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-card border border-border bg-bg-sunken p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
          <Key size={15} weight="regular" />
          {t("title")}
        </div>
        <Button
          aria-label={t("downloadAriaLabel")}
          onClick={() => downloadRecoveryCodes(codes)}
          size="sm"
          startIcon={<DownloadSimple size={14} weight="regular" />}
          type="button"
          variant="secondary"
        >
          {t("download")}
        </Button>
      </div>
      <p className="text-[11.5px] text-fg-muted">{t("description")}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {codes.map((code) => (
          <code
            className="rounded-control border border-border bg-bg-elev px-2 py-1 font-sans tabular-nums text-[12px] text-fg"
            key={code}
          >
            {code}
          </code>
        ))}
      </div>
    </div>
  );
}
