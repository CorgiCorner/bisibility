"use client";

import dynamic from "next/dynamic";

export const FiltersDrawer = dynamic(
  () => import("@/components/keywords/filters/FiltersDrawer").then((mod) => mod.FiltersDrawer),
  { ssr: false },
);

export const KeywordsGridDialogs = dynamic(
  () => import("./KeywordsGridDialogs").then((mod) => mod.KeywordsGridDialogs),
  { ssr: false },
);
