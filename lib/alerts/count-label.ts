export function alertCountLabel(count: number) {
  return `${count} ${count === 1 ? "alert" : "alerts"}`;
}
