import { TwoFactorChallengeForm } from "@/components/auth/TwoFactorChallengeForm";
import { returnToOrDefault } from "@/lib/auth/return-to";
import { getSession } from "@/lib/auth/session";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr";
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
        <Link className="mb-8 flex items-center gap-[9px] text-fg no-underline" href="/">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent text-white">
            <ChartLineUp aria-hidden size={17} weight="bold" />
          </span>
          <span className="text-[18px] font-bold tracking-[-0.5px]">bisibility</span>
        </Link>
        <TwoFactorChallengeForm returnTo={destination} />
      </section>
    </main>
  );
}
