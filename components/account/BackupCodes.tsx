"use client";

import { Button } from "@/components/ui";
import { downloadTextFile } from "@/lib/ui/download";
import { DownloadSimpleIcon as DownloadSimple, KeyIcon as Key } from "@phosphor-icons/react";

const RECOVERY_CODES_FILENAME = "bisibility_recovery_codes.txt";

function downloadRecoveryCodes(codes: readonly string[]) {
  downloadTextFile(`${codes.join("\n")}\n`, RECOVERY_CODES_FILENAME, "text/plain;charset=utf-8");
}

export function BackupCodes({ codes }: Readonly<{ codes: readonly string[] }>) {
  if (!codes.length) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-[12px] border border-border-soft bg-bg-sunken p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
          <Key size={15} />
          Backup codes
        </div>
        <Button
          aria-label="Download recovery codes"
          onClick={() => downloadRecoveryCodes(codes)}
          size="sm"
          startIcon={<DownloadSimple size={14} />}
          type="button"
          variant="secondary"
        >
          Download .txt
        </Button>
      </div>
      <p className="text-[11.5px] text-fg-muted">
        Save these codes now. They will not be shown again.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {codes.map((code) => (
          <code
            className="rounded-md border border-border-soft bg-bg-elev px-2 py-1 font-mono text-[12px] text-fg"
            key={code}
          >
            {code}
          </code>
        ))}
      </div>
    </div>
  );
}
