import { EmptyState } from "@/components/ui/EmptyState";
import { ArchiveIcon as Archive } from "@phosphor-icons/react/dist/ssr/Archive";

export function StoredResearchEmpty({ title }: Readonly<{ title: string }>) {
  return (
    <EmptyState
      description="No saved results are available for this module yet. Stored data remains available even when a provider is disconnected."
      icon={<Archive aria-hidden size={28} weight="regular" />}
      title={`No saved ${title.toLowerCase()} results`}
    />
  );
}
