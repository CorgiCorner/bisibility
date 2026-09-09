import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";

export function AuditNotAuthorized() {
  return (
    <div className="max-w-[720px]">
      <EmptyState
        description="Audit records are restricted to Admin and Auditor roles for this project."
        icon={<ShieldWarning aria-hidden size={30} weight="regular" />}
        title="Audit log restricted"
      />
    </div>
  );
}
