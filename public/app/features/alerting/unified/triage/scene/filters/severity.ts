/**
 * Canonical severity levels used for the triage severity filter.
 *
 * Each level maps to a set of label values that are considered equivalent.
 * The filter uses a regex match so that aliases resolve to the same level.
 *
 * Levels in ascending order of severity:
 *   low (1 bar)  →  medium (2 bars)  →  high (3 bars)  →  critical (4 bars)
 *
 * Aliases:
 *   info, notice                       → low
 *   warning, warn, minor, moderate     → medium
 *   major                              → high
 *   crit, fatal                        → critical
 */

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SeverityDefinition {
  level: SeverityLevel;
  /** All label values that map to this level (first entry is the canonical one). */
  values: string[];
  /** Number of filled bars (1–4). */
  bars: number;
}

export const SEVERITY_DEFINITIONS: SeverityDefinition[] = [
  { level: 'low', values: ['low', 'info', 'notice'], bars: 1 },
  { level: 'medium', values: ['medium', 'warning', 'warn', 'minor', 'moderate'], bars: 2 },
  { level: 'high', values: ['high', 'major'], bars: 3 },
  { level: 'critical', values: ['critical', 'crit', 'fatal'], bars: 4 },
];

/** Returns the regex value string to use with an `=~` filter for a given level. */
export function severityFilterRegex(level: SeverityLevel): string {
  const def = SEVERITY_DEFINITIONS.find((d) => d.level === level);
  if (!def) {
    return level;
  }
  return `(?i)${def.values.join('|')}`;
}

/** Returns the canonical level for a raw severity label value, or undefined if unknown. */
export function canonicalSeverity(value: string): SeverityLevel | undefined {
  const lower = value.toLowerCase();
  return SEVERITY_DEFINITIONS.find((d) => d.values.includes(lower))?.level;
}
