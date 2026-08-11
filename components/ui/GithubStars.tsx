import { GITHUB_URL } from "@/lib/site/site";
import { GithubLogoIcon as GithubLogo, StarIcon as Star } from "@phosphor-icons/react/dist/ssr";
import { cva } from "class-variance-authority";

export type GithubStarsSize = "lg" | "md" | "sm";
/** `chip` stands alone on a surface; `nav` sits among nav links and borrows their shape. */
export type GithubStarsVariant = "chip" | "nav";

export type GithubStarsProps = {
  /** Server-fetched count. Null or undefined keeps the repository link without showing a count. */
  count?: string | null;
  href?: string;
  size?: GithubStarsSize;
  variant?: GithubStarsVariant;
};

const starsVariants = cva(
  "group inline-flex items-center whitespace-nowrap font-mono font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid",
  {
    variants: {
      size: {
        sm: "gap-1.5 text-[11px]",
        md: "gap-2 text-[12px]",
        lg: "gap-2 text-[13px]",
      },
      variant: {
        // Its own control: an edge, an elevated fill, and a hover that darkens it.
        chip: "rounded-full border border-border-strong bg-bg-elev text-fg-muted hover:bg-bg-sunken hover:text-fg",
        // One of the nav links: no edge, no fill, and the same pill on hover they use.
        nav: "rounded-lg text-fg-muted hover:bg-bg-sunken hover:text-fg",
      },
    },
    compoundVariants: [
      { class: "h-7 px-2.5", size: "sm", variant: "chip" },
      { class: "h-8 px-3", size: "md", variant: "chip" },
      { class: "h-9 px-3.5", size: "lg", variant: "chip" },
      { class: "px-2 py-[5px]", size: "sm", variant: "nav" },
      { class: "px-[11px] py-[7px]", size: "md", variant: "nav" },
      { class: "px-3 py-2", size: "lg", variant: "nav" },
    ],
    defaultVariants: { size: "md", variant: "chip" },
  },
);

const glyphSize = { lg: 16, md: 15, sm: 14 } as const;

/**
 * Star count is a claim about the repository, so it reads better as a number than as a word.
 * Four figures and up collapse to one decimal - "1.2k" stays the same width as the repo grows,
 * which matters in a header row that must not reflow.
 */
function formatStars(count: string) {
  const value = Number(count);

  if (!Number.isFinite(value) || value < 1000) {
    return count;
  }

  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function GithubStars({
  count,
  href = GITHUB_URL,
  size = "md",
  variant = "chip",
}: Readonly<GithubStarsProps>) {
  const formattedCount = count ? formatStars(count) : null;

  return (
    <a
      aria-label={formattedCount ? `${formattedCount} stars on GitHub` : "GitHub repository"}
      className={starsVariants({ size, variant })}
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      <GithubLogo aria-hidden size={glyphSize[size]} />
      {formattedCount ? (
        <>
          <span aria-hidden>{formattedCount}</span>
          {/* Phosphor draws each weight as its own path, so the two cannot be tweened. Both sit in
              one grid cell and cross-fade instead, which also lets the filled one arrive slightly
              larger without nudging the row. */}
          <span aria-hidden className="grid text-yellow-text">
            <Star
              className="col-start-1 row-start-1 transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0"
              size={glyphSize[size] - 3}
            />
            <Star
              className="col-start-1 row-start-1 scale-90 opacity-0 transition-[opacity,transform] duration-200 group-hover:scale-110 group-hover:opacity-100 group-focus-visible:scale-110 group-focus-visible:opacity-100"
              size={glyphSize[size] - 3}
              weight="fill"
            />
          </span>
        </>
      ) : null}
    </a>
  );
}
