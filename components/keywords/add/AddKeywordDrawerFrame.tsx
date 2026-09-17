"use client";

import {
  NewMarketCreator,
  type NewMarketCreatorProps,
} from "@/components/markets/sheet/NewMarketCreator";
import { NewMarketScheduleEditor } from "@/components/markets/sheet/NewMarketScheduleEditor";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { useAddKeywordDrawerMarkets } from "./useAddKeywordDrawerMarkets";

type AddKeywordDrawerFrameProps = {
  children: ReactNode;
  creator: Omit<NewMarketCreatorProps, "children">;
  domain?: string;
  footer: ReactNode;
  marketOpen: boolean;
  scheduleStep: ReturnType<typeof useAddKeywordDrawerMarkets>["scheduleStep"];
  onClose: () => void;
  onExited: () => void;
  open: boolean;
};

/** Keep one drawer mounted while its shared creators exchange their content. */
export function AddKeywordDrawerFrame({
  children,
  creator,
  domain,
  footer,
  marketOpen,
  scheduleStep,
  onClose,
  onExited,
  open,
}: Readonly<AddKeywordDrawerFrameProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  return (
    <NewMarketCreator {...creator}>
      {(market) => (
        <AppDrawer
          description={
            marketOpen || scheduleStep.open
              ? undefined
              : domain
                ? t("drawerDescriptionForDomain", { domain })
                : t("drawerDescription")
          }
          footer={scheduleStep.open ? undefined : marketOpen ? market.footer : footer}
          backAction={
            scheduleStep.open
              ? { label: t("backToKeywords"), onClick: scheduleStep.close }
              : marketOpen
                ? {
                    label: market.creatingSchedule ? t("backToMarket") : t("backToKeywords"),
                    onClick: market.onBack,
                  }
                : undefined
          }
          onClose={onClose}
          onExited={() => {
            market.onClose();
            onExited();
          }}
          open={open}
          title={
            scheduleStep.open ? t("newSchedule") : marketOpen ? market.title : t("drawerTitle")
          }
        >
          {scheduleStep.open && creator.scheduleContext ? (
            <NewMarketScheduleEditor
              context={creator.scheduleContext}
              memberSummary={t("marketDrawerDescription")}
              onBack={scheduleStep.close}
              onSaved={scheduleStep.onSaved}
              projectId={creator.projectId}
            />
          ) : marketOpen ? (
            market.content
          ) : (
            children
          )}
        </AppDrawer>
      )}
    </NewMarketCreator>
  );
}
