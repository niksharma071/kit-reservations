const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres raises 22P02 on a malformed uuid literal, which would surface as a
 * 500 for what is really a client mistake. Callers guard with this first.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
