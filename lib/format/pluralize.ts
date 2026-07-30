export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${Math.abs(count) === 1 ? singular : plural}`;
}

export function countLabel(count: number, singular: string, plural?: string) {
  return pluralize(count, singular, plural);
}
