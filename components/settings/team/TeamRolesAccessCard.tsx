import { TeamReadOnlyCard } from "@/components/settings/team/TeamReadOnlyCard";
import { teamCardGeometryClassNames } from "@/components/settings/team/team-card-layout";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/ui/cn";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { MinusIcon as Minus } from "@phosphor-icons/react/dist/ssr/Minus";
import { useTranslations } from "next-intl";

const displayedRoles = ["owner", "admin", "member", "viewer"] as const satisfies readonly Role[];

const capabilityRows = [
  {
    allowed: (role: Role) => canProjectAction(role, "read", "keyword"),
    key: "view",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "update", "keyword"),
    key: "edit",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "delete", "keyword"),
    key: "delete",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "create", "api_key"),
    key: "keys",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "manage", "team"),
    key: "manage",
  },
  { allowed: canReadProjectAudit, key: "audit" },
  {
    allowed: (role: Role) => canProjectAction(role, "manage", "billing"),
    key: "billing",
  },
  {
    allowed: (role: Role) => canProjectAction(role, "manage", "ownership"),
    key: "ownership",
  },
] as const;

function PermissionMark({
  allowed,
  capability,
  role,
}: Readonly<{ allowed: boolean; capability: string; role: string }>) {
  const t = useTranslations("projectSettingsTeam.roles");
  const Icon = allowed ? CheckCircle : Minus;
  return (
    <span
      aria-label={t("permission", { allowed: String(allowed), capability, role })}
      className={cn("grid place-items-center", allowed ? "text-green-text" : "text-fg-muted")}
      role="img"
    >
      <Icon aria-hidden size={15} weight="regular" />
    </span>
  );
}

export function TeamRolesAccessCard() {
  const t = useTranslations("projectSettingsTeam");
  const roleLabel = (role: Role) => {
    if (role === "owner") return t("members.role.owner");
    if (role === "admin") return t("members.role.admin");
    if (role === "member") return t("members.role.editor");
    return t("members.role.viewer");
  };
  const capabilityLabel = (key: (typeof capabilityRows)[number]["key"]) => {
    if (key === "view") return t("roles.view");
    if (key === "edit") return t("roles.edit");
    if (key === "delete") return t("roles.delete");
    if (key === "keys") return t("roles.keys");
    if (key === "manage") return t("roles.manage");
    if (key === "audit") return t("roles.audit");
    if (key === "billing") return t("roles.billing");
    return t("roles.ownership");
  };

  return (
    <TeamReadOnlyCard
      className={teamCardGeometryClassNames.roles}
      description={t("roles.description")}
      frameId="roles"
      title={t("roles.title")}
    >
      <div className="overflow-x-auto rounded-control border border-border">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-[minmax(220px,1.5fr)_repeat(4,1fr)] border-b border-border bg-bg-sunken px-4 py-3 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            <span>{t("roles.capability")}</span>
            {displayedRoles.map((role) => (
              <span className="text-center" key={role}>
                {roleLabel(role)}
              </span>
            ))}
          </div>
          {capabilityRows.map((row, index) => (
            <div
              className={cn(
                "grid min-h-[42px] grid-cols-[minmax(220px,1.5fr)_repeat(4,1fr)] items-center px-4 text-[12.5px]",
                index < capabilityRows.length - 1 && "border-b border-border",
              )}
              key={row.key}
            >
              <span>{capabilityLabel(row.key)}</span>
              {displayedRoles.map((role) => (
                <PermissionMark
                  allowed={row.allowed(role)}
                  capability={capabilityLabel(row.key)}
                  key={role}
                  role={roleLabel(role)}
                />
              ))}
            </div>
          ))}
          <p className="m-0 border-t border-border px-4 py-3 text-[11.5px] text-fg-muted">
            {t("roles.footnote")}
          </p>
        </div>
      </div>
    </TeamReadOnlyCard>
  );
}
