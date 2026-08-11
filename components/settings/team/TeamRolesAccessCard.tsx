import { TeamReadOnlyCard } from "@/components/settings/team/TeamReadOnlyCard";
import { teamCardGeometryClassNames } from "@/components/settings/team/team-card-layout";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/ui/cn";
import { CheckCircleIcon as CheckCircle, MinusIcon as Minus } from "@phosphor-icons/react/dist/ssr";

const displayedRoles = [
  { label: "Owner", value: "owner" },
  { label: "Admin", value: "admin" },
  { label: "Editor", value: "member" },
  { label: "Viewer", value: "viewer" },
] as const satisfies readonly { label: string; value: Role }[];

const capabilityRows = [
  {
    allowed: (role: Role) => canProjectAction(role, "read", "keyword"),
    label: "View dashboards, keywords & exports",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "update", "keyword"),
    label: "Add & edit keywords, alerts, views",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "delete", "keyword"),
    label: "Delete keywords, alerts, competitors",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "create", "api_key"),
    label: "Create & revoke API keys and hooks",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "manage", "team"),
    label: "Invite & manage members",
  },
  { allowed: canReadProjectAudit, label: "Read the audit log" },
  {
    allowed: (role: Role) => canProjectAction(role, "manage", "billing"),
    label: "Billing",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "manage", "ownership"),
    label: "Transfer ownership, delete project",
  },
] as const;

function PermissionMark({
  allowed,
  capability,
  role,
}: Readonly<{ allowed: boolean; capability: string; role: string }>) {
  const Icon = allowed ? CheckCircle : Minus;
  return (
    <span
      aria-label={`${role}: ${capability}: ${allowed ? "allowed" : "not allowed"}`}
      className={cn("grid place-items-center", allowed ? "text-green-text" : "text-fg-muted")}
      role="img"
    >
      <Icon aria-hidden size={15} weight={allowed ? "fill" : "regular"} />
    </span>
  );
}

export function TeamRolesAccessCard() {
  return (
    <TeamReadOnlyCard
      className={teamCardGeometryClassNames.roles}
      description="What each role can do; a role is changed on the member's row."
      frameId="roles"
      title="Roles & access"
    >
      <div className="overflow-x-auto rounded-[10px] border border-border">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-[minmax(220px,1.5fr)_repeat(4,1fr)] border-b border-border bg-bg-sunken px-4 py-3 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            <span>Capability</span>
            {displayedRoles.map((role) => (
              <span
                className={cn("text-center", role.value === "owner" && "text-accent-text")}
                key={role.value}
              >
                {role.label}
              </span>
            ))}
          </div>
          {capabilityRows.map((row) => (
            <div
              className="grid min-h-[42px] grid-cols-[minmax(220px,1.5fr)_repeat(4,1fr)] items-center border-b border-border-soft px-4 text-[12.5px] last:border-b-0"
              key={row.label}
            >
              <span>{row.label}</span>
              {displayedRoles.map((role) => (
                <PermissionMark
                  allowed={row.allowed(role.value)}
                  capability={row.label}
                  key={role.value}
                  role={role.label}
                />
              ))}
            </div>
          ))}
          <p className="m-0 border-t border-border-soft px-4 py-3 text-[11.5px] text-fg-muted">
            Owner is unique and can transfer ownership. Every role change is written to the audit
            log. Existing audit grants are shown on member rows and cannot be assigned here.
          </p>
        </div>
      </div>
    </TeamReadOnlyCard>
  );
}
