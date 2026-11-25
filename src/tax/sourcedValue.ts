export interface SourcedAlternative<T> {
  readonly value: T;
  readonly sourceIds: readonly string[];
}

export interface SourcedValue<T> {
  readonly value: T;
  readonly verified: boolean;
  readonly sourceIds: readonly string[];
  readonly note?: string;
  readonly alternatives?: readonly SourcedAlternative<T>[];
}

/** A value confirmed on a primary page that was read. */
export function verifiedValue<T>(value: T, sourceIds: readonly string[], note?: string): SourcedValue<T> {
  return note === undefined ? { value, verified: true, sourceIds } : { value, verified: true, sourceIds, note };
}

/** A value seen only in secondary sources, or unknown (null). */
export function unverifiedValue<T>(value: T, sourceIds: readonly string[], note?: string): SourcedValue<T> {
  return note === undefined ? { value, verified: false, sourceIds } : { value, verified: false, sourceIds, note };
}

/** Sources disagree: every value is kept and the value stays unverified (D-TAX-3). */
export function conflictingValue<T>(
  value: T,
  sourceIds: readonly string[],
  alternatives: readonly SourcedAlternative<T>[],
  note: string,
): SourcedValue<T> {
  return { value, verified: false, sourceIds, note, alternatives };
}

/** The highest of a rate and its conflicting alternatives, so a reserve never falls short (D-TAX-3). */
export function highestCost(rate: SourcedValue<number>): number {
  return Math.max(rate.value, ...(rate.alternatives ?? []).map((alternative) => alternative.value));
}
