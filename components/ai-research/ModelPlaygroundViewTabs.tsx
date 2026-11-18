"use client";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TabStrip } from "@/components/ui/Tabs";
import { useTranslations } from "next-intl";

type View = "answers" | "brands" | "sources";
export function ModelPlaygroundViewTabs({
  value,
  onChange,
}: Readonly<{
  value: View;
  onChange: (view: View) => void;
}>) {
  const t = useTranslations("projectAiResearch.modelPlayground");
  return (
    <TabStrip className="w-full md:w-auto md:max-w-full">
      <SegmentedControl
        ariaLabel={t("viewLabel")}
        className="w-max"
        fitContent
        onChange={onChange}
        optionClassName="whitespace-nowrap"
        options={[
          { label: t("answers"), value: "answers", tooltip: t("answersHint") },
          { label: t("brands"), value: "brands", tooltip: t("brandsHint") },
          { label: t("sources"), value: "sources", tooltip: t("sourcesHint") },
        ]}
        size="toolbar"
        value={value}
      />
    </TabStrip>
  );
}
