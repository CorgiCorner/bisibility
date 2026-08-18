import { BrandLockup, Card } from "@/components/ui";
import { isFirstRun, isFirstRunAdministratorPending } from "@/lib/auth/first-run";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { requireSession } from "@/lib/auth/session";
import { isEmailConfigured } from "@/lib/email/registry";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import packageJson from "@/package.json";
import type { Metadata } from "next";
import Link from "next/link";
import { signOutAndSwitchAccountAction } from "./actions";
import { SetupAccountStatusCard } from "./SetupAccountStatusCard";
import { SetupRecoveryAction } from "./SetupRecoveryAction";
import { SetupStepper } from "./SetupStepper";
import { SetupSuccess } from "./SetupSuccess";
import { SetupWizard } from "./SetupWizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createNoindexMetadata({
  title: "Set up bisibility",
  description: "Create the administrator account for this bisibility installation.",
});

function SetupFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 text-fg">
      <div className="flex w-full max-w-[480px] flex-col gap-4.5">
        <Link className="inline-flex justify-center no-underline" href="/">
          <BrandLockup />
        </Link>
        {children}
        <p className="m-0 text-center font-mono text-[10.5px] text-fg-muted">
          self-hosted · v{packageJson.version}
        </p>
      </div>
    </main>
  );
}

export default async function SetupPage() {
  if (await isFirstRun()) {
    return (
      <SetupFrame>
        <Card className="p-7" size="lg">
          <SetupWizard mailerConfigured={isEmailConfigured()} />
        </Card>
      </SetupFrame>
    );
  }

  await requireSession();
  if (await getInstanceAdminSession()) {
    return (
      <SetupFrame>
        <Card className="p-7" size="lg">
          <div className="flex flex-col gap-5.5">
            <SetupStepper current="done" />
            <SetupSuccess mailerConfigured={isEmailConfigured()} />
          </div>
        </Card>
      </SetupFrame>
    );
  }

  if (await isFirstRunAdministratorPending()) {
    return (
      <SetupFrame>
        <SetupAccountStatusCard
          administratorExists={false}
          recoveryAction={<SetupRecoveryAction />}
          switchAccountAction={signOutAndSwitchAccountAction}
        />
      </SetupFrame>
    );
  }

  return (
    <SetupFrame>
      <SetupAccountStatusCard
        administratorExists
        switchAccountAction={signOutAndSwitchAccountAction}
      />
    </SetupFrame>
  );
}
