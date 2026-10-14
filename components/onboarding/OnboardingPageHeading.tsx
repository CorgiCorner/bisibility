export function OnboardingPageHeading({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <section className="mt-6">
      <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-1px]">{title}</h1>
      <p className="m-0 mt-2 max-w-[560px] text-[15px] leading-[1.5] text-fg-muted">
        {description}
      </p>
    </section>
  );
}
