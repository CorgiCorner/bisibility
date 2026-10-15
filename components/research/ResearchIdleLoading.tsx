import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import type { Icon } from "@phosphor-icons/react";

/** Static guidance shares its real wrapping and spacing while the controls resolve. */
export function ResearchIdleLoading({
  title,
  bullets,
  icon,
}: Readonly<{ title: string; bullets: string[]; icon: Icon }>) {
  return (
    <div className="min-w-0 opacity-40 motion-safe:animate-pulse">
      <EmptyState title={title} bullets={bullets} mark={<ModuleMark bordered icon={icon} />} />
    </div>
  );
}
