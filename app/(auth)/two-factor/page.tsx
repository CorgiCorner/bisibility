import { TwoFactorChallengeForm } from "@/components/auth/TwoFactorChallengeForm";
import { BrandLockup } from "@/components/ui";
import { returnToOrDefault } from "@/lib/auth/return-to";
import { getSession } from "@/lib/auth/session";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = createNoindexMetadata();

type TwoFactorPageProps = {
  searchParams?: Promise<{ next?: string | string[] }>;
};

export default async function TwoFactorPage({ searchParams }: Readonly<TwoFactorPageProps> = {}) {
  const params = await searchParams;
  const next = Array.isArray(params?.next) ? params.next[0] : params?.next;
  const destination = returnToOrDefault(next);

  if (await getSession()) {
    redirect(destination);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-11 text-fg">
      <section className="w-full max-w-[430px] rounded-[16px] border border-border bg-bg-sidebar p-6 sm:p-8">
        <Link className="mb-8 inline-flex w-fit no-underline" href="/">
          <BrandLockup />
        </Link>
        <TwoFactorChallengeForm returnTo={destination} />
      </section>
    </main>
  );
}
