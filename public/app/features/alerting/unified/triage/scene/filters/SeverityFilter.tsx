import { css, cx } from '@emotion/css';

import { GrafanaTheme2 } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { useSceneContext } from '@grafana/scenes-react';
import { Stack, Tooltip, useStyles2 } from '@grafana/ui';

import { LabelStats } from '../useLabelsBreakdown';
import { addOrReplaceFilter, removeFilter, useFilterValue } from '../utils';

import { SEVERITY_DEFINITIONS, SeverityLevel, canonicalSeverity, severityFilterRegex } from './severity';

interface SeverityCount {
  firing: number;
  pending: number;
}

/** Aggregates label value counts from the labels breakdown into per-level counts. */
function useSeverityCounts(labels: LabelStats[]): Map<SeverityLevel, SeverityCount> {
  const severityStats = labels.find((l) => l.key === 'severity');
  const counts = new Map<SeverityLevel, SeverityCount>();

  if (!severityStats) {
    return counts;
  }

  for (const { value, firing, pending } of severityStats.values) {
    const level = canonicalSeverity(value);
    if (!level) {
      continue;
    }
    const existing = counts.get(level) ?? { firing: 0, pending: 0 };
    counts.set(level, { firing: existing.firing + firing, pending: existing.pending + pending });
  }

  return counts;
}

interface SeverityFilterProps {
  labels: LabelStats[];
}

export function SeverityFilter({ labels }: SeverityFilterProps) {
  const styles = useStyles2(getStyles);
  const sceneContext = useSceneContext();
  const activeValue = useFilterValue('severity');
  const counts = useSeverityCounts(labels);

  // The active level is whichever definition's regex is currently set
  const activeLevel = SEVERITY_DEFINITIONS.find((d) => activeValue === severityFilterRegex(d.level))?.level;

  const toggle = (level: SeverityLevel) => {
    const regex = severityFilterRegex(level);
    if (activeLevel === level) {
      removeFilter(sceneContext, 'severity');
    } else {
      addOrReplaceFilter(sceneContext, 'severity', '=~', regex);
    }
  };

  return (
    <Stack direction="column" gap={0.5}>
      {SEVERITY_DEFINITIONS.map((def) => {
        const count = counts.get(def.level);
        return (
          <Tooltip key={def.level} content={def.values.slice(1).join(', ')} placement="right">
            <button
              className={cx(styles.severityButton, activeLevel === def.level && styles.severityButtonActive)}
              onClick={() => toggle(def.level)}
            >
              <SeverityBars level={def.level} />
              <span className={styles.severityLabel}>
                <Trans i18nKey={`alerting.triage.severity-${def.level}`}>{capitalise(def.level)}</Trans>
              </span>
              <span className={styles.severityCount}>{count !== undefined ? count.firing + count.pending : 0}</span>
            </button>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

interface SeverityBarsProps {
  level: SeverityLevel;
}

export function SeverityBars({ level }: SeverityBarsProps) {
  const styles = useStyles2(getStyles);
  const def = SEVERITY_DEFINITIONS.find((d) => d.level === level);
  const filled = def?.bars ?? 0;

  const heights = [4, 7, 10, 13];

  return (
    <span className={styles.bars} aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <span
          key={i}
          className={cx(styles.bar, i < filled ? styles[`bar_${level}`] : styles.barEmpty)}
          style={{ height: heights[i] }}
        />
      ))}
    </span>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const getStyles = (theme: GrafanaTheme2) => ({
  severityButton: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    width: '100%',
    padding: theme.spacing(0.5, 0.75),
    background: 'none',
    border: `1px solid transparent`,
    borderRadius: theme.shape.radius.default,
    cursor: 'pointer',
    color: theme.colors.text.secondary,
    textAlign: 'left',
    '&:hover': {
      background: theme.colors.action.hover,
    },
  }),
  severityButtonActive: css({
    background: theme.colors.action.selected,
  }),
  severityLabel: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  severityCount: css({
    marginLeft: 'auto',
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    fontVariantNumeric: 'tabular-nums',
  }),
  // Bar container
  bars: css({
    display: 'inline-flex',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  }),
  bar: css({
    width: 4,
    // eslint-disable-next-line
    borderRadius: 1,
  }),
  barEmpty: css({
    background: theme.colors.border.medium,
  }),

  // Filled bar colours per level — bars grow taller left-to-right
  bar_low: css({
    background: theme.colors.success.text,
  }),
  bar_medium: css({
    background: theme.colors.warning.text,
  }),
  bar_high: css({
    background: theme.colors.warning.main,
  }),
  bar_critical: css({
    background: theme.colors.error.text,
  }),
});
