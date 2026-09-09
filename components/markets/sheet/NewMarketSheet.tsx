"use client";

import { Sheet } from "@/components/ui/Sheet";
import { NewMarketCreator, type NewMarketCreatorProps } from "./NewMarketCreator";

export type NewMarketSheetProps = Omit<NewMarketCreatorProps, "children"> & { open: boolean };

export function NewMarketSheet({ open, ...props }: Readonly<NewMarketSheetProps>) {
  return (
    <NewMarketCreator {...props}>
      {(creator) => (
        <Sheet
          backAction={
            creator.creatingSchedule
              ? { label: "Back to market", onClick: creator.onBack }
              : undefined
          }
          footer={creator.footer}
          heightVariant="form"
          onClose={creator.onClose}
          open={open}
          title={creator.title}
          widthVariant="form"
        >
          {creator.content}
        </Sheet>
      )}
    </NewMarketCreator>
  );
}
