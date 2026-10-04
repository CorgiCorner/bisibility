// Keep metadata and date labels on the plot edges, with rank labels in their own gutter.
export const positionHistoryChartLayout = {
  yWidth: 40,
  margin: { top: 12, right: 16, bottom: 0, left: 0 },
  dateAxisLayout: "aligned" as const,
};

export const positionHistoryContentInsets = {
  marginLeft: positionHistoryChartLayout.yWidth + positionHistoryChartLayout.margin.left,
  marginRight: positionHistoryChartLayout.margin.right,
};
