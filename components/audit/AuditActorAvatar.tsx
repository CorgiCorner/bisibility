import { Avatar } from "@/components/ui/Avatar";
import type { AuditEntry } from "@/lib/queries/audit";
import { cn } from "@/lib/ui/cn";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";

export function AuditActorAvatar({
  actor,
  className,
  systemLabel,
}: Readonly<{ actor: AuditEntry["actor"]; className: string; systemLabel: string }>) {
  return actor.id === "system" ? (
    <span aria-label={systemLabel} className={cn("grid place-items-center", className)} role="img">
      <GearSixIcon aria-hidden size={16} weight="regular" />
    </span>
  ) : (
    <Avatar alt="" className={className} initials={actor.initials} src={actor.avatarUrl} />
  );
}
