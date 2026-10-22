import { Checkbox } from "@/components/ui/Checkbox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { firstPartyAppApiScopes, grantedApiScopes } from "@/lib/api/scope-policy";
import {
  canCreateOAuthApiTokens,
  defaultOAuthAccessLevel,
  type OAuthAccessLevel,
  oauthApiTokenChoiceRequested,
  offeredOAuthAccessLevels,
} from "@/lib/auth/oauth-consent-copy";
import { useTranslations } from "next-intl";

const knownScopes = new Set([
  "openid",
  "profile",
  "email",
  "offline_access",
  "read",
  "write",
  "admin",
  "tokens:write",
  "api:read",
  "api:write",
]);

const levelMessageKey = {
  full: "full",
  read: "read",
  read_write: "readWrite",
} as const satisfies Record<OAuthAccessLevel, "full" | "read" | "readWrite">;

type IdentityKey = "profileAndEmail" | "profile" | "email" | "openid";
type ProjectKey = "admin" | "write" | "read";

function identityAccessKey(scopes: string[]): IdentityKey | null {
  const profile = scopes.includes("profile");
  const email = scopes.includes("email");
  if (profile && email) return "profileAndEmail";
  if (profile) return "profile";
  if (email) return "email";
  return scopes.includes("openid") ? "openid" : null;
}

function projectAccessKey(scopes: string[]): ProjectKey | null {
  const granted = [...grantedApiScopes(scopes), ...firstPartyAppApiScopes(scopes)];
  if (granted.includes("admin")) return "admin";
  if (granted.includes("write")) return "write";
  if (granted.includes("read")) return "read";
  return null;
}

export function OAuthConsentScopes({
  allowApiTokens,
  ceiling,
  disabled,
  dynamic,
  level,
  onAllowApiTokens,
  onLevel,
  scopes,
}: Readonly<{
  allowApiTokens: boolean;
  ceiling: string[];
  disabled: boolean;
  dynamic: boolean;
  level: OAuthAccessLevel | null;
  onAllowApiTokens: (value: boolean) => void;
  onLevel: (level: OAuthAccessLevel) => void;
  scopes: string[];
}>) {
  const t = useTranslations("auth.oauthConsent");
  const scopesT = useTranslations("auth.oauthConsent.scopes");
  const identity = identityAccessKey(scopes);
  const access = projectAccessKey(scopes);
  const unknown = scopes.some((scope) => !knownScopes.has(scope));
  const tokens = scopes.includes("tokens:write");
  const offered = offeredOAuthAccessLevels(ceiling);
  const selectedLevel = level ?? defaultOAuthAccessLevel(ceiling);
  const showLevelChoice = dynamic && offered.length > 1 && selectedLevel !== null;
  const showTokenChoice = dynamic && oauthApiTokenChoiceRequested(ceiling);
  const showReviewedTokens = !dynamic && canCreateOAuthApiTokens(scopes);
  const showPaidOperations = access === "write" || access === "admin";
  return (
    <section className="mt-6 text-[13px] leading-[1.6]" aria-labelledby="requested-scopes-title">
      <p className="m-0 font-semibold" id="requested-scopes-title">
        {scopesT("intro")}
      </p>
      {showLevelChoice ? (
        <SegmentedControl
          className="mt-3"
          disabled={disabled}
          label={t("accessLevel.label")}
          labelClassName="text-[13px] font-semibold"
          onChange={onLevel}
          options={offered.map((value) => ({
            label: t(`accessLevel.${levelMessageKey[value]}`),
            value,
          }))}
          size="xs"
          value={selectedLevel}
        />
      ) : null}
      {showPaidOperations ? (
        <p className="mt-2 mb-0 text-[12.5px] leading-[1.6] text-fg-muted">{t("paidOperations")}</p>
      ) : null}
      {showTokenChoice ? (
        <Checkbox
          checked={allowApiTokens}
          className="mt-3"
          description={
            <span className="text-red-text">
              {scopesT.rich("credentials", { strong: (chunks) => <strong>{chunks}</strong> })}
            </span>
          }
          disabled={disabled}
          label={t("apiTokens.allow")}
          labelClassName="text-[13px] font-semibold"
          onChange={(event) => onAllowApiTokens(event.target.checked)}
        />
      ) : null}
      <ul className="mt-2 mb-0 list-disc space-y-2 pl-5">
        {identity || access ? (
          <li>
            {[
              identity ? scopesT(`identity.${identity}`) : null,
              // The continued form keeps the second clause mid-sentence.
              access
                ? scopesT(identity ? `projectContinued.${access}` : `project.${access}`)
                : null,
            ]
              .filter(Boolean)
              .join("; ")}
            .{access ? ` ${scopesT("withinPermissions")}` : null}
          </li>
        ) : null}
        {showReviewedTokens ? (
          <li className="text-red-text">
            {scopesT.rich("credentialsReviewed", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
        ) : null}
        {unknown ? <li className="text-red-text">{scopesT("unknown")}</li> : null}
        {!identity && !access && !tokens && !showReviewedTokens && !unknown ? (
          <li>{scopesT("none")}</li>
        ) : null}
      </ul>
    </section>
  );
}
