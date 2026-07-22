/** Minimum characters typed before pair suggestions are shown. */
export const MIN_SUGGESTION_QUERY_LENGTH = 2;

/** Maximum number of suggestions shown at once, to keep the list scannable. */
export const MAX_SUGGESTIONS = 8;

/**
 * Rank `available` pair symbols against a user's in-progress query, excluding
 * symbols already added. Matches anywhere in the string (not just a prefix),
 * so typing a quote asset (e.g. "USDT") also surfaces matches; prefix matches
 * are ranked above other substring matches.
 */
export const suggestSymbols = (available: string[], query: string, exclude: string[]): string[] => {
  const q = query.trim().toUpperCase();
  if (q.length < MIN_SUGGESTION_QUERY_LENGTH) return [];

  const excluded = new Set(exclude);

  return available
    .filter((s) => s.includes(q) && !excluded.has(s))
    .sort((a, b) => {
      const aRank = a.startsWith(q) ? 0 : 1;
      const bRank = b.startsWith(q) ? 0 : 1;
      return aRank !== bRank ? aRank - bRank : a < b ? -1 : a > b ? 1 : 0;
    })
    .slice(0, MAX_SUGGESTIONS);
};
