import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sparkline } from "./Sparkline";

const mocks = vi.hoisted(() => ({ chart: vi.fn() }));

vi.mock("@mui/x-charts/SparkLineChart", () => ({
  SparkLineChart: (props: { data: number[]; xAxis: { data: number[] } }) => {
    mocks.chart(props);
    return <span>{props.data.join(",")}</span>;
  },
}));

describe("Sparkline", () => {
  it("provides an accessible image label without fabricating zeroes for gaps", () => {
    render(<Sparkline ariaLabel="Monthly volume trend" data={[10, null, 20]} />);

    expect(screen.getByRole("img", { name: "Monthly volume trend" })).toHaveTextContent("10,20");
    expect(mocks.chart).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [10, 20],
        xAxis: { data: [0, 2], scaleType: "linear" },
      }),
    );
  });
});
