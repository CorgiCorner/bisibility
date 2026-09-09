"use client";

import {
  NewMarketCreator,
  type NewMarketCreatorProps,
} from "@/components/markets/sheet/NewMarketCreator";
import { NewMarketScheduleEditor } from "@/components/markets/sheet/NewMarketScheduleEditor";
import { AppDrawer } from "@/components/ui/AppDrawer";
import type { ReactNode } from "react";
import { addKeywordDrawerDescription } from "./AddKeywordDrawerExtensions";
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
  return (
    <NewMarketCreator {...creator}>
      {(market) => (
        <AppDrawer
          description={
            marketOpen || scheduleStep.open ? undefined : addKeywordDrawerDescription(false, domain)
          }
          footer={scheduleStep.open ? undefined : marketOpen ? market.footer : footer}
          backAction={
            scheduleStep.open
              ? { label: "Back to keywords", onClick: scheduleStep.close }
              : marketOpen
                ? {
                    label: market.creatingSchedule ? "Back to market" : "Back to keywords",
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
          title={scheduleStep.open ? "New schedule" : marketOpen ? market.title : "Add keywords"}
        >
          {scheduleStep.open && creator.scheduleContext ? (
            <NewMarketScheduleEditor
              context={creator.scheduleContext}
              memberSummary="Keywords will join this schedule when you add them."
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
