import { AccountEmailCard } from "@/components/account/AccountEmailCard";
import { AccountSection } from "@/components/account/AccountSection";
import { AccountShell } from "@/components/account/AccountShell";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { DemoAccountNotice } from "@/components/account/DemoAccountNotice";
import { ProfileSection } from "@/components/account/ProfileSection";
import { PrivacyChoicesLink } from "@/components/analytics/PrivacyChoicesLink";
import {
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  requestAccountEmailChange,
  requestAccountEmailChangeCode,
  requestCurrentAccountEmailVerification,
} from "@/lib/actions/account-email";
import { readOnlyDemoConfig } from "@/lib/demo/config";
import { getAccount } from "@/lib/queries/account";
import { deleteAccount, updateProfile } from "./actions";

export default async function AccountPage() {
  if (readOnlyDemoConfig()) return <DemoAccountNotice section="profile" />;
  const account = await getAccount();

  return (
    <AccountShell activeSection="profile">
      <div className="flex flex-col gap-5.5">
        <ProfileSection
          email={account.email}
          emailVerified={account.emailVerified}
          image={account.avatarUrl}
          name={account.name}
          publicId={account.publicId}
          updateProfile={updateProfile}
        />
        <AccountEmailCard
          key={`${account.email}:${account.emailVerified}`}
          confirmAccountEmailChange={confirmAccountEmailChange}
          confirmCurrentAccountEmailVerification={confirmCurrentAccountEmailVerification}
          email={account.email}
          emailVerified={account.emailVerified}
          requestAccountEmailChange={requestAccountEmailChange}
          requestAccountEmailChangeCode={requestAccountEmailChangeCode}
          requestCurrentAccountEmailVerification={requestCurrentAccountEmailVerification}
        />
        <ConnectedAccounts accounts={account.connectedAccounts} />
        <AccountSection
          description="Review or change the optional analytics and setup replay choices stored in this browser."
          title="Privacy choices"
        >
          <PrivacyChoicesLink />
        </AccountSection>
        <DeleteAccount deleteAccount={deleteAccount} email={account.email} />
      </div>
    </AccountShell>
  );
}
