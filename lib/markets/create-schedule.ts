import type { NewMarketCreateInput } from "./create-input";
export function inlineScheduleName(
  input: Extract<NonNullable<NewMarketCreateInput["schedule"]>, { kind: "inline" }>,
) {
  return (
    input.name ||
    `${input.frequency[0].toUpperCase()}${input.frequency.slice(1)} ${input.timeOfDay ?? "06:00"}`
  );
}

export function inlineCron(
  input: Extract<NonNullable<NewMarketCreateInput["schedule"]>, { kind: "inline" }>,
) {
  const hour = Number((input.timeOfDay ?? "06:00").slice(0, 2));
  if (input.frequency === "weekly") return `0 ${hour} * * 1`;
  if (input.frequency === "monthly") return `0 ${hour} 1 * *`;
  return null;
}
