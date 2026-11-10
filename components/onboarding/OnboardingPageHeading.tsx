import { Button } from "@/components/ui/Button";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";

export function OnboardingPageHeading({
  backLink,
  title,
  description,
}: Readonly<{ backLink?: { href: string; label: string }; title: string; description: string }>) {
  return (
    <section className="mt-6">
      {backLink ? (
        <Button
          className="mb-3 min-h-10"
          href={backLink.href}
          size="sm"
          startIcon={<ArrowLeftIcon weight="regular" aria-hidden size={15} />}
          variant="ghost"
        >
          {backLink.label}
        </Button>
      ) : null}
      <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-1px]">{title}</h1>
      <p className="m-0 mt-2 max-w-[560px] text-[15px] leading-[1.5] text-fg-muted">
        {description}
      </p>
    </section>
  );
}
