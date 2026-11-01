import { getDomainRating } from "@/lib/queries/domain-rating";
import { DomainRatingCard } from "./DomainRatingCard";

export async function DomainRatingSection({ projectRef }: Readonly<{ projectRef: string }>) {
  const now = new Date();
  const data = await getDomainRating(projectRef, now);
  return <DomainRatingCard data={data} today={now.toISOString().slice(0, 10)} />;
}
