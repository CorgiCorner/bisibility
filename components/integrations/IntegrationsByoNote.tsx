import { Card } from "@/components/ui";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/ssr";

export function IntegrationsByoNote() {
  return (
    <Card className="flex items-start gap-[11px] rounded-xl px-4 py-3.5" size="md">
      <span className="flex h-5 shrink-0 items-center">
        <Key aria-hidden className="text-accent-solid" size={17} weight="fill" />
      </span>
      <p className="m-0 text-[13px] leading-[1.5] text-fg-muted">
        <strong className="font-semibold text-fg">Bring your own providers.</strong> In self-hosted
        bisibility you connect your own accounts. Credentials stay in your instance and provider
        usage is billed directly between you and each provider.
      </p>
    </Card>
  );
}
