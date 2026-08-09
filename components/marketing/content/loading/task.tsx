import { BrandLockup } from "@/components/ui";
import Link from "next/link";
import { FeatureCardSkeleton, SkeletonBlock, skeletonKeys, TextStack } from "./primitives";

function BrandLink() {
  return (
    <Link className="inline-flex w-fit no-underline" href="/">
      <BrandLockup />
    </Link>
  );
}

export function LoginLoadingPage() {
  return (
    <main className="grid min-h-dvh bg-bg text-fg md:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-border border-r bg-bg-sidebar p-8 md:flex lg:p-11">
        <BrandLink />
        <div className="max-w-[420px]">
          <SkeletonBlock className="h-[12px] w-[178px]" tone="accent" />
          <SkeletonBlock className="mt-[14px] h-[38px] w-[86%] rounded-[9px]" />
          <SkeletonBlock className="mt-3 h-[38px] w-[64%] rounded-[9px]" />
          <div className="mt-[14px]">
            <TextStack widths={["100%", "88%", "60%"]} />
          </div>
          <div className="mt-[26px] overflow-hidden rounded-[13px] border border-border">
            <div className="flex items-center gap-[7px] border-code-faint border-b bg-code-bg px-[14px] py-[9px]">
              <span className="h-2.5 w-2.5 rounded-full bg-red" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow" />
              <span className="h-2.5 w-2.5 rounded-full bg-green" />
              <SkeletonBlock className="ml-1.5 h-[11px] w-[90px]" tone="code" />
            </div>
            <div className="grid gap-3 bg-code-bg px-4 py-[15px]">
              <SkeletonBlock className="h-[13px] w-[66%]" tone="code" />
              <SkeletonBlock className="h-[13px] w-[82%]" tone="code" />
              <SkeletonBlock className="h-[13px] w-[54%]" tone="code" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-[18px]">
          {["68px", "76px", "96px"].map((width) => (
            <SkeletonBlock className="h-[13px]" key={width} style={{ width }} />
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-11">
        <div className="w-full max-w-[420px] rounded-[16px] border border-border bg-bg-elev p-6">
          <SkeletonBlock className="h-[28px] w-[58%] rounded-[8px]" />
          <div className="mt-3">
            <TextStack widths={["88%", "66%"]} />
          </div>
          <SkeletonBlock className="mt-7 h-[46px] w-full rounded-[11px]" />
          <SkeletonBlock className="mt-3 h-[46px] w-full rounded-[11px]" tone="accent" />
          <div className="mt-6 grid gap-3">
            <SkeletonBlock className="h-[44px] w-full rounded-[10px]" />
            <SkeletonBlock className="h-[44px] w-full rounded-[10px]" />
          </div>
        </div>
      </section>
    </main>
  );
}

export function InviteLoadingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 text-fg">
      <div className="w-full max-w-[470px] rounded-[16px] border border-border bg-bg-elev p-6">
        <BrandLink />
        <div className="mt-8">
          <SkeletonBlock className="h-12 w-12 rounded-[13px]" tone="accent" />
          <SkeletonBlock className="mt-5 h-[11px] w-[92px]" />
          <SkeletonBlock className="mt-3 h-[30px] w-[62%] rounded-[8px]" />
          <div className="mt-4 grid gap-2 rounded-[12px] border border-border bg-bg-sunken p-4">
            {["84%", "96%", "72%"].map((width) => (
              <div className="flex items-center justify-between gap-3" key={width}>
                <SkeletonBlock className="h-[13px] w-[92px]" />
                <SkeletonBlock className="h-[13px]" style={{ width }} />
              </div>
            ))}
          </div>
          <SkeletonBlock className="mt-5 h-10 w-full rounded-[9px]" tone="accent" />
        </div>
      </div>
    </main>
  );
}

export function OnboardingLoadingPage() {
  return (
    <>
      <section className="mt-6">
        <SkeletonBlock className="h-[36px] w-[310px] rounded-[8px]" />
        <div className="mt-3 max-w-[560px]">
          <TextStack widths={["100%", "76%"]} />
        </div>
      </section>
      <section className="mt-6">
        <SkeletonBlock className="h-[13px] w-[92px]" />
        <div className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-bg-sunken">
          <SkeletonBlock className="h-full w-[33%] rounded-[3px]" tone="accent" />
        </div>
        <div className="mt-7 grid items-start gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
          <div className="hidden rounded-[16px] border border-border bg-bg-elev p-4 lg:block">
            <div className="grid gap-3">
              {skeletonKeys("onboarding-rail", 4).map((key) => (
                <SkeletonBlock className="h-[44px] rounded-[11px]" key={key} />
              ))}
            </div>
          </div>
          <div className="rounded-[16px] border border-border bg-bg-elev p-5 sm:p-6">
            <SkeletonBlock className="h-[26px] w-[52%] rounded-[7px]" />
            <div className="mt-4">
              <TextStack widths={["92%", "70%"]} />
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <FeatureCardSkeleton />
              <FeatureCardSkeleton />
            </div>
            <div className="mt-7 flex items-center justify-between border-border border-t pt-5">
              <SkeletonBlock className="h-[40px] w-[92px] rounded-[9px]" />
              <SkeletonBlock className="h-[40px] w-[122px] rounded-[9px]" tone="accent" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function CloudTopBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <BrandLink />
      <div className="flex flex-none items-center gap-3">
        <SkeletonBlock className="h-10 w-10 rounded-[9px]" />
        <SkeletonBlock className="h-[30px] w-[168px] rounded-full" />
      </div>
    </div>
  );
}

export function CloudImportLoadingPage() {
  return (
    <>
      <CloudTopBarSkeleton />
      <SkeletonBlock className="mt-7 h-[13px] w-[112px]" />
      <header className="mt-4">
        <SkeletonBlock className="h-[31px] w-[60%] rounded-[8px]" />
        <div className="mt-3 max-w-[520px]">
          <TextStack widths={["100%", "76%"]} />
        </div>
      </header>
      <section className="mt-1">
        <div className="mt-6 rounded-[16px] border border-border bg-bg-elev p-5">
          <SkeletonBlock className="h-[21px] w-[48%] rounded-[7px]" />
          <div className="mt-4">
            <TextStack widths={["100%", "72%"]} />
          </div>
          <SkeletonBlock className="mt-5 h-[44px] w-full rounded-[10px]" />
        </div>
        <div className="mt-4 rounded-[16px] border border-border bg-bg-elev p-5">
          <SkeletonBlock className="h-[21px] w-[42%] rounded-[7px]" />
          <div className="mt-4 grid gap-3">
            {skeletonKeys("transfer-row", 3).map((key) => (
              <SkeletonBlock className="h-[42px] rounded-[10px]" key={key} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
