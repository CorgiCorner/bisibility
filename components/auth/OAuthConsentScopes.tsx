import { getOAuthConsentCopy } from "@/lib/auth/oauth-consent-copy";
import type { OAuthConsentClient } from "@/lib/auth/oauth-consent-types";
import { cn } from "@/lib/ui/cn";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CrownSimpleIcon as CrownSimple,
  EnvelopeSimpleIcon as EnvelopeSimple,
  EyeIcon as Eye,
  IdentificationBadgeIcon as IdentificationBadge,
  KeyIcon as Key,
  PencilSimpleIcon as PencilSimple,
  PlugsConnectedIcon as PlugsConnected,
  QuestionIcon as Question,
  UserIcon as User,
  UserCircleIcon as UserCircle,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

type ScopeItem = {
  broad?: boolean;
  icon: ComponentType<{
    "aria-hidden"?: boolean;
    className?: string;
    size?: number;
    weight?: "bold" | "duotone" | "fill" | "light" | "regular" | "thin";
  }>;
  value: string;
};

type ScopeGroup = {
  icon: ScopeItem["icon"];
  id: "identity" | "access" | "credentials" | "other";
  note: string;
  scopes: ScopeItem[];
  title: string;
};

const scopeDefinitions: Record<string, Omit<ScopeItem, "value"> & { group: ScopeGroup["id"] }> = {
  openid: { group: "identity", icon: IdentificationBadge },
  profile: { group: "identity", icon: User },
  email: { group: "identity", icon: EnvelopeSimple },
  offline_access: { group: "identity", icon: ArrowsClockwise },
  read: { group: "access", icon: Eye },
  write: { group: "access", icon: PencilSimple },
  admin: { broad: true, group: "access", icon: CrownSimple },
  "tokens:write": { broad: true, group: "credentials", icon: Key },
};

const groupDefinitions: Array<Omit<ScopeGroup, "scopes">> = [
  { icon: UserCircle, id: "identity", note: "who you are", title: "Sign-in & session" },
  { icon: PlugsConnected, id: "access", note: "your rank data", title: "MCP & API access" },
  {
    icon: Key,
    id: "credentials",
    note: "create API tokens for your account",
    title: "Credentials",
  },
  { icon: Question, id: "other", note: "additional permission", title: "Other" },
];

function groupedScopes(scopes: string[]) {
  const normalized = scopes.length ? scopes : ["openid"];
  return groupDefinitions
    .map((group) => ({
      ...group,
      scopes: normalized
        .map((value) => {
          const definition = scopeDefinitions[value];
          return {
            broad: definition?.broad,
            group: definition?.group ?? "other",
            icon: definition?.icon ?? Question,
            value,
          };
        })
        .filter((scope) => scope.group === group.id),
    }))
    .filter((group) => group.scopes.length);
}

function ScopeChip({ scope }: Readonly<{ scope: ScopeItem }>) {
  const Icon = scope.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] leading-none",
        scope.broad
          ? "border-red/30 bg-red/10 text-red-text"
          : "border-border-strong bg-bg-elev text-fg-muted",
      )}
    >
      <Icon aria-hidden size={12} />
      {scope.value}
    </span>
  );
}

export function OAuthConsentScopes({
  client,
  scopes,
}: Readonly<{ client: OAuthConsentClient; scopes: string[] }>) {
  const persona = getOAuthConsentCopy(client).persona;
  return (
    <section className="mt-4" aria-labelledby="requested-scopes-title">
      <p
        className="m-0 font-mono text-[10.5px] uppercase tracking-[0.5px] text-fg-muted"
        id="requested-scopes-title"
      >
        Requested scopes
      </p>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {groupedScopes(scopes).map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.id}>
              <div className="flex flex-wrap items-center gap-2">
                <GroupIcon
                  aria-hidden
                  className={cn(
                    group.id === "identity" && "text-blue-text",
                    group.id === "access" && "text-accent-text",
                    group.id === "credentials" && "text-yellow-text",
                    group.id === "other" && "text-fg-muted",
                  )}
                  size={14}
                  weight="fill"
                />
                <span className="text-[12.5px] font-semibold text-fg">{group.title}</span>
                <span className="text-[12px] text-fg-muted">{group.note}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5.5">
                {group.scopes.map((scope) => (
                  <ScopeChip key={scope.value} scope={scope} />
                ))}
              </div>
              {group.id === "credentials" && persona === "cli" ? (
                <p className="mt-2 mb-0 pl-5.5 text-[12px] text-fg-muted">
                  The CLI will create one API token for this device.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
