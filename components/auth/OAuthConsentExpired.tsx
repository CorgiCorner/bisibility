import { Card } from "@/components/ui";
import { HourglassLowIcon as HourglassLow } from "@phosphor-icons/react";

export function OAuthConsentExpired() {
  return (
    <Card className="w-full max-w-[520px] p-6 sm:p-8" size="lg">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-yellow/15 text-yellow">
        <HourglassLow aria-hidden size={24} weight="fill" />
      </span>
      <h2 className="mt-5 mb-0 text-[20px] font-semibold tracking-[-0.5px]">Request expired</h2>
      <p className="mt-3 mb-0 text-[14px] leading-[1.6] text-fg-muted">
        This authorization request timed out after 5 minutes, so nothing was approved. Start a fresh
        login from your client.
      </p>
      <div className="mt-4 rounded-[11px] bg-code-bg px-4 py-3 font-mono text-[12px] text-code-fg">
        <span className="mr-3 text-code-faint">→</span>
        codex mcp login bisibility
      </div>
      <p className="mt-4 mb-0 text-[12.5px] text-fg-faint">This tab can be closed.</p>
    </Card>
  );
}
