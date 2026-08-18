import { SystemPage, SystemPrimaryAction } from "@/components/marketing/system/SystemPage";
import { verifyMarketingUnsubscribeToken } from "@/lib/email/marketing-unsubscribe";
import type { Metadata } from "next";
import { UnsubscribeButton } from "./UnsubscribeButton";

export const metadata: Metadata = {
  alternates: { canonical: null },
  robots: { follow: false, index: false },
  title: "Email preferences",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

export default async function EmailUnsubscribePage({ searchParams }: Readonly<PageProps>) {
  const params = await searchParams;
  const token = value(params.token) ?? "";
  const success = value(params.status) === "success";
  const valid = !success && verifyMarketingUnsubscribeToken(token) !== null;

  const title = success
    ? "You are unsubscribed"
    : valid
      ? "Stop founder check-ins?"
      : "This unsubscribe link is invalid";
  const description = success
    ? "We will not send you welcome follow-ups or other marketing emails. Account and service messages are unaffected."
    : valid
      ? "You will stop receiving founder check-ins and other marketing emails. Account and service messages will still arrive."
      : "The link could not be verified. Reply to the email and we will update the preference for you.";

  return (
    <SystemPage
      actions={
        valid ? (
          <UnsubscribeButton token={token} />
        ) : (
          <SystemPrimaryAction href="/">Back to bisibility</SystemPrimaryAction>
        )
      }
      description={description}
      kicker="EMAIL PREFERENCES"
      statusLabel="EMAIL PREFERENCES"
      terminal={null}
      title={title}
    />
  );
}
