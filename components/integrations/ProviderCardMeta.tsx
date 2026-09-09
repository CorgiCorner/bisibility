import { IdChip } from "@/components/ui/IdChip";
import type { IntegrationProviderData } from "@/lib/integrations/types";

export function ProviderCardMeta({ provider }: Readonly<{ provider: IntegrationProviderData }>) {
  const meta =
    provider.status === "connected" || provider.status === "needs_reauth"
      ? provider.meta.filter((row) => row.label.toLowerCase() !== "state")
      : [];
  if (meta.length === 0) return null;
  return (
    <dl className="m-0 mt-3 flex flex-wrap gap-x-4 gap-y-2">
      {meta.map((row) => (
        <div className="min-w-0" key={row.label}>
          <dt className="text-[10px] text-fg-muted">{row.label}</dt>
          <dd className="m-0 mt-0.5 break-words text-[12px] text-fg">
            {provider.id === "ga4" && row.label === "Property" && /^\d+$/.test(row.value) ? (
              <IdChip
                className="border-0 bg-transparent px-0"
                copyLabel="Copy property ID"
                size="xs"
                value={row.value}
              />
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
