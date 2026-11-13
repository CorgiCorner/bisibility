import { Button } from "@/components/ui/Button";

export function ReportExampleThumbnail({
  exampleHref,
  label,
}: Readonly<{ exampleHref: string; label: string }>) {
  return (
    <Button
      aria-label={label}
      className="h-auto max-w-64 flex-col items-stretch gap-2 whitespace-normal p-2 text-left"
      href={exampleHref}
      variant="outline"
    >
      {/* biome-ignore lint/performance/noImgElement: this sample is rendered by the report card route. */}
      <img
        alt=""
        className="h-auto w-full rounded-control"
        height={630}
        src={`${exampleHref}/card`}
        width={1200}
      />
      <span>{label}</span>
    </Button>
  );
}
