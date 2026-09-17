import { grantedApiScopes } from "@/lib/api/scope-policy";
import { canCreateOAuthApiTokens } from "@/lib/auth/oauth-consent-copy";
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
]);

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
  const granted = grantedApiScopes(scopes);
  if (granted.includes("admin")) return "admin";
  if (granted.includes("write")) return "write";
  if (granted.includes("read")) return "read";
  return null;
}

export function OAuthConsentScopes({ scopes }: Readonly<{ scopes: string[] }>) {
  const t = useTranslations("auth.oauthConsent.scopes");
  const identity = identityAccessKey(scopes);
  const access = projectAccessKey(scopes);
  const unknown = scopes.some((scope) => !knownScopes.has(scope));
  const credentials = canCreateOAuthApiTokens(scopes);
  return (
    <section className="mt-6 text-[13px] leading-[1.6]" aria-labelledby="requested-scopes-title">
      <p className="m-0 font-semibold" id="requested-scopes-title">
        {t("intro")}
      </p>
      <ul className="mt-2 mb-0 list-disc space-y-2 pl-5">
        {identity || access ? (
          <li>
            {[
              identity ? t(`identity.${identity}`) : null,
              // The continued form keeps the second clause mid-sentence.
              access ? t(identity ? `projectContinued.${access}` : `project.${access}`) : null,
            ]
              .filter(Boolean)
              .join("; ")}
            .{access ? ` ${t("withinPermissions")}` : null}
          </li>
        ) : null}
        {credentials ? (
          <li className="text-red-text">
            {t.rich("credentials", { strong: (chunks) => <strong>{chunks}</strong> })}
          </li>
        ) : null}
        {unknown ? <li className="text-red-text">{t("unknown")}</li> : null}
        {!identity && !access && !credentials && !unknown ? <li>{t("none")}</li> : null}
      </ul>
    </section>
  );
}
