/** Exact forwarding: even absent optional keys remain own properties, as in explicit JSX. */
export function pickGridProps<T, K extends keyof T>(props: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, props[key]])) as Pick<T, K>;
}
