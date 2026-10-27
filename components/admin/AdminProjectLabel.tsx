import { IdChip } from "@/components/ui/IdChip";
import { isPublicIdOfType } from "@/lib/db/public-id";

/** Tenant names stay private; a fallback public reference remains readable and copyable. */
export function AdminProjectLabel({ value }: { value: string }) {
  return isPublicIdOfType(value, "prj") ? (
    <IdChip value={value} truncate="middle" size="xs" />
  ) : (
    <span className="break-words font-medium">{value}</span>
  );
}
