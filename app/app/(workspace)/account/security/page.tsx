import { revokeSession, signOutEverywhere } from "@/app/app/(workspace)/account/actions";
import { AccountPageHeader } from "@/components/account/AccountPageHeader";
import { PersonalTokensSection } from "@/components/account/PersonalTokensSection";
import { SecurityFactors } from "@/components/account/SecurityFactors";
import { SessionsSection } from "@/components/account/SessionsSection";
import { PageContent } from "@/components/shell/PageContent";
import { issuePersonalTokenAction, revokePersonalTokenAction } from "@/lib/actions/personalToken";
import { requireSession } from "@/lib/auth/session";
import { getAccount, getPreferences } from "@/lib/queries/account";
import { getPersonalTokens } from "@/lib/queries/personal-tokens";

export default async function SecurityPage() {
  const session = await requireSession();
  const [account, preferences] = await Promise.all([getAccount(), getPreferences()]);
  const personalTokens = await getPersonalTokens(session.user.id, { preferences });

  return (
    <PageContent className="flex flex-col gap-[22px]" variant="form">
      <AccountPageHeader active="/app/account/security" />
      <SecurityFactors
        hasPasswordCredential={account.hasPasswordCredential}
        initiallyEnabled={account.twoFactorEnabled}
      />
      <PersonalTokensSection
        issueToken={issuePersonalTokenAction}
        revokeToken={revokePersonalTokenAction}
        tokens={personalTokens}
      />
      <SessionsSection
        revokeSession={revokeSession}
        sessions={account.sessions}
        signOutEverywhere={signOutEverywhere}
      />
    </PageContent>
  );
}
