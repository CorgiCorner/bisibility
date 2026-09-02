import type { ProjectRef } from "@/lib/routing/app-path";
import { docsLinkProps } from "@/lib/site/site";
import {
  SparkleIcon as Sparkle,
  StarIcon as Star,
  UserPlusIcon as UserPlus,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { type GoFurtherCard, goFurtherCards } from "./go-further-cards";

const cardIcons: Record<GoFurtherCard["id"], ReactNode> = {
  ai: <Sparkle aria-hidden data-go-further-icon="Sparkle" size={17} weight="regular" />,
  github: <Star aria-hidden data-go-further-icon="Star" size={17} weight="regular" />,
  team: <UserPlus aria-hidden data-go-further-icon="UserPlus" size={17} weight="regular" />,
};

const cardClassName =
  "group flex min-w-0 flex-col rounded-card border border-border bg-bg-elev px-4 py-3.5 no-underline shadow-none transition-colors hover:border-border-control";

function CardContent({ card }: Readonly<{ card: GoFurtherCard }>) {
  return (
    <>
      <span className="text-fg-muted transition-colors group-hover:text-fg">
        {cardIcons[card.id]}
      </span>
      <span className="mt-2 text-[13px] font-semibold leading-[1.35] text-fg">{card.title}</span>
      <span className="mt-0.5 text-[11.5px] leading-[1.45] text-fg-muted">{card.description}</span>
    </>
  );
}

export function GoFurtherCards({ projectRef }: Readonly<{ projectRef: ProjectRef }>) {
  return (
    <section aria-labelledby="go-further-heading">
      <h2
        className="text-left font-sans tabular-nums text-[10px] font-semibold uppercase leading-none tracking-[0.5px] text-fg-muted"
        id="go-further-heading"
      >
        Go further
      </h2>
      <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
        {goFurtherCards(projectRef).map((card) =>
          card.external ? (
            <a
              className={cardClassName}
              key={card.id}
              {...docsLinkProps(card.href, { external: true })}
            >
              <CardContent card={card} />
            </a>
          ) : (
            <Link className={cardClassName} href={card.href} key={card.id}>
              <CardContent card={card} />
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
