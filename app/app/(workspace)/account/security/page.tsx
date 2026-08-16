import { revokeSession, signOutEverywhere } from "@/app/app/(workspace)/account/actions";
import { AccountShell } from "@/components/account/AccountShell";
import { PersonalTokensSection } from "@/components/account/PersonalTokensSection";
import { SecurityFactors } from "@/components/account/SecurityFactors";
import { SessionsSection } from "@/components/account/SessionsSection";
import { issuePersonalTokenAction, revokePersonalTokenAction } from "@/lib/actions/personalToken";
import { requireSession } from "@/lib/auth/session";
import { getAccount, getPreferences } from "@/lib/queries/account";
import { getPersonalTokens } from "@/lib/queries/personal-tokens";

export default async function SecurityPage() {
  const session = await requireSession();
  const [account, preferences] = await Promise.all([getAccount(), getPreferences()]);
  const personalTokens = await getPersonalTokens(session.user.id);

  return (
    <AccountShell activeSection="security">
      <div className="flex flex-col gap-[22px]">
        <SecurityFactors
          hasPasswordCredential={account.hasPasswordCredential}
          initiallyEnabled={account.twoFactorEnabled}
        />
        <PersonalTokensSection
          dateFormat={preferences.dateFormat}
          issueToken={issuePersonalTokenAction}
          revokeToken={revokePersonalTokenAction}
          tokens={personalTokens}
        />
        <SessionsSection
          revokeSession={revokeSession}
          sessions={account.sessions}
          signOutEverywhere={signOutEverywhere}
        />
      </div>
    </AccountShell>
  );
}
