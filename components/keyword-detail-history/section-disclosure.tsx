"use client";
import { IconButton } from "@/components/ui/IconButton";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
export function useSectionDisclosure(name: string) {
  const key = `bisibility:keyword-sections:${name}`;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const value = localStorage.getItem(key);
      setOpen(value !== "closed");
    } catch {
      setOpen(true);
    }
  }, [key]);
  const toggle = () =>
    setOpen((value) => {
      const next = !value;
      try {
        localStorage.setItem(key, next ? "open" : "closed");
      } catch {}
      return next;
    });
  return { open, toggle };
}
export function SectionChevron({
  open,
  toggle,
  title,
}: {
  open: boolean;
  toggle: () => void;
  title: string;
}) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  return (
    <IconButton
      size="medium"
      className="size-9 min-h-9 shrink-0 rounded-control p-0"
      variant="ghost"
      aria-label={t(open ? "collapseSection" : "expandSection", { section: title })}
      aria-expanded={open}
      onClick={toggle}
    >
      <CaretDownIcon weight="regular" aria-hidden size={16} className={open ? "" : "-rotate-90"} />
    </IconButton>
  );
}
