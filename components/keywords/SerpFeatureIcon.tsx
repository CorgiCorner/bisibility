import type { KnownFeature } from "@/lib/checks/retrieved-results-model";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { ImagesIcon } from "@phosphor-icons/react/dist/csr/Images";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/csr/ListBullets";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { NewspaperIcon } from "@phosphor-icons/react/dist/csr/Newspaper";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/csr/PlayCircle";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { ShoppingBagIcon } from "@phosphor-icons/react/dist/csr/ShoppingBag";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";

const icons = {
  knowledgePanel: BuildingsIcon,
  images: ImagesIcon,
  shopping: ShoppingBagIcon,
  video: PlayCircleIcon,
  peopleAlsoAsk: QuestionIcon,
  news: NewspaperIcon,
  topStories: NewspaperIcon,
  localPack: MapPinIcon,
  aiOverview: SparkleIcon,
};
export function SerpFeatureIcon({ kind }: { kind: KnownFeature | "other" }) {
  const Icon = icons[kind as keyof typeof icons] ?? ListBulletsIcon;
  return <Icon weight="regular" size={16} className="shrink-0 text-fg-muted" aria-hidden />;
}
