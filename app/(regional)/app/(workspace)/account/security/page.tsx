import { revokeSession, signOutEverywhere } from "@/app/(regional)/app/(workspace)/account/actions";
import { AccountShell } from "@/components/account/AccountShell";
import { ConnectedAppsSection } from "@/components/account/ConnectedAppsSection";
import { DemoAccountNotice } from "@/components/account/DemoAccountNotice";
import { PersonalTokensSection } from "@/components/account/PersonalTokensSection";
import { SecurityFactors } from "@/components/account/SecurityFactors";
import { SessionsSection } from "@/components/account/SessionsSection";
import { revokeConnectedApp } from "@/lib/actions/connected-apps";
import { issuePersonalTokenAction, revokePersonalTokenAction } from "@/lib/actions/personalToken";
import { validateSecurityReturnTo } from "@/lib/auth/security-return-to";
import { requireSession } from "@/lib/auth/session";
import { resolveDemoAccountView } from "@/lib/demo/account-view";
import { getAccount, getPreferences } from "@/lib/queries/account";
import { getConnectedApps } from "@/lib/queries/connected-apps";
import { getPersonalTokens } from "@/lib/queries/personal-tokens";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const returnTo = validateSecurityReturnTo((await searchParams)?.returnTo);
  const session = await requireSession();
  if ((await resolveDemoAccountView(session.user.id)) === "locked") {
    return <DemoAccountNotice section="security" />;
  }
  const [account, preferences] = await Promise.all([getAccount(), getPreferences()]);
  const [personalTokens, connectedApps] = await Promise.all([
    getPersonalTokens(session.user.id),
    getConnectedApps(session.user.id),
  ]);
  const referenceTime = new Date().toISOString();

  return (
    <AccountShell activeSection="security">
      <div className="flex flex-col gap-5.5">
        <SecurityFactors
          hasPasswordCredential={account.hasPasswordCredential}
          initiallyEnabled={account.twoFactorEnabled}
          returnTo={returnTo ?? undefined}
        />
        <ConnectedAppsSection
          apps={connectedApps}
          dateFormat={preferences.dateFormat}
          revokeApp={revokeConnectedApp}
        />
        <div id="personal-tokens" className="scroll-mt-6">
          <PersonalTokensSection
            dateFormat={preferences.dateFormat}
            issueToken={issuePersonalTokenAction}
            revokeToken={revokePersonalTokenAction}
            tokens={personalTokens}
          />
        </div>
        <SessionsSection
          referenceTime={referenceTime}
          revokeSession={revokeSession}
          sessions={account.sessions}
          signOutEverywhere={signOutEverywhere}
        />
      </div>
    </AccountShell>
  );
}
