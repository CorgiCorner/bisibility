/**
 * The key a query row is looked up by in the tracked set. It has to stay the normalization the
 * match ran on, so the badge in the table and the lookup on the server can never disagree: the
 * matcher normalizes the texts it is given the same way before comparing them.
 *
 * It lives apart from the lookup because the table that renders the badge is a client
 * component and the lookup is server-only.
 */
export function trackedKey(text: string) {
  return text.trim().toLowerCase();
}
