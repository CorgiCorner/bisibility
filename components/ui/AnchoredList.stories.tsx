import { AnchoredList } from "@/components/ui/AnchoredList";
import { Input } from "@/components/ui/Input";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const meta = { title: "UI/AnchoredList", component: AnchoredList } satisfies Meta<
  typeof AnchoredList
>;
export default meta;
type Story = StoryObj<typeof meta>;

function SearchExample() {
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  return (
    <div className="m-8 h-12 w-64 overflow-hidden">
      <Input
        aria-label="Find a city"
        placeholder="Find a city"
        ref={setAnchor}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <AnchoredList
        anchorEl={anchor}
        open
        className="rounded-control border border-border bg-bg-elev p-2 text-fg"
      >
        {["London", "Paris", "Warsaw"]
          .filter((city) => city.toLowerCase().includes(query.toLowerCase()))
          .map((city) => (
            <div className="p-2" key={city}>
              {city}
            </div>
          ))}
      </AnchoredList>
    </div>
  );
}
export const EscapesClippingParent: Story = {
  args: { anchorEl: null, open: true },
  render: () => <SearchExample />,
};
