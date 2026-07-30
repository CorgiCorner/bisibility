import { EmptyState } from "@/components/ui";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/dist/ssr";

export function AuditNotAuthorized() {
  return (
    <div className="max-w-[720px]">
      <EmptyState
        description="Audit records are restricted to Admin and Auditor roles for this workspace."
        icon={<ShieldWarning aria-hidden size={30} weight="fill" />}
        title="Audit log restricted"
      />
    </div>
  );
}
