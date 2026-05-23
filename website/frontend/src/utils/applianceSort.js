/**
 * Canonical sort order for a room's appliance list.
 *
 * Priority:
 *   1. If any appliance in the room has a numeric `sortIndex`, the room is
 *      considered manually ordered → sort by sortIndex ascending.
 *      Items without sortIndex go to the bottom (stable, by createdAt).
 *   2. Otherwise auto-sort by `usageCount` descending — most-frequently-used
 *      bubbles to the top. Tie-break by lastUsedAt (most recent first),
 *      then by createdAt (oldest first) for total stability.
 *
 * Returns a NEW array — never mutates the input.
 */
export function sortAppliances(appliances) {
  if (!appliances || appliances.length === 0) return [];

  const hasManualOrder = appliances.some(
    (a) => typeof a.sortIndex === 'number' && Number.isFinite(a.sortIndex)
  );

  const copy = appliances.slice();

  if (hasManualOrder) {
    copy.sort((a, b) => {
      const ai = typeof a.sortIndex === 'number' ? a.sortIndex :  Number.POSITIVE_INFINITY;
      const bi = typeof b.sortIndex === 'number' ? b.sortIndex :  Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  } else {
    copy.sort((a, b) => {
      const au = a.usageCount || 0;
      const bu = b.usageCount || 0;
      if (au !== bu) return bu - au;                       // most used first
      const al = a.lastUsedAt || 0;
      const bl = b.lastUsedAt || 0;
      if (al !== bl) return bl - al;                       // most recently used first
      return (a.createdAt || 0) - (b.createdAt || 0);      // stable
    });
  }

  return copy;
}
