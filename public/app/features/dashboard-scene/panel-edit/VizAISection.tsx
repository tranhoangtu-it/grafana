import { css } from '@emotion/css';
import { merge } from 'lodash';
import { useCallback, useState } from 'react';

import { FieldConfigSource, GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { VizPanel } from '@grafana/scenes';
import { Alert, Button, Spinner, Stack, TextArea, useStyles2 } from '@grafana/ui';

import { getVizAIProvider, VizAIResponse } from './vizAI';

interface PreviousState {
  pluginId: string;
  options: Record<string, unknown>;
  fieldConfig: FieldConfigSource;
}

interface Props {
  panel: VizPanel;
}

/**
 * PoC: AI-assisted panel configuration section.
 * Sends a natural-language prompt to the Grafana backend proxy,
 * which calls Anthropic Claude and returns a panel config diff.
 */
export function VizAISection({ panel }: Props) {
  const styles = useStyles2(getStyles);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousState, setPreviousState] = useState<PreviousState | null>(null);

  const handleApply = useCallback(async () => {
    if (!prompt.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Snapshot current state for undo
    const snapshot: PreviousState = {
      pluginId: panel.state.pluginId,
      options: panel.state.options as Record<string, unknown>,
      fieldConfig: panel.state.fieldConfig,
    };

    try {
      const provider = getVizAIProvider();
      const response = await provider.complete(prompt, {
        pluginId: panel.state.pluginId,
        options: panel.state.options as Record<string, unknown>,
        fieldConfig: panel.state.fieldConfig,
      });

      applyAIResponse(panel, response);
      setPreviousState(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [panel, prompt, isLoading]);

  const handleUndo = useCallback(() => {
    if (!previousState) {
      return;
    }
    if (previousState.pluginId !== panel.state.pluginId) {
      panel.changePluginType(previousState.pluginId, previousState.options, previousState.fieldConfig);
    } else {
      panel.onOptionsChange(previousState.options, true);
      panel.onFieldConfigChange(previousState.fieldConfig, true);
    }
    setPreviousState(null);
  }, [panel, previousState]);

  return (
    <div className={styles.container}>
      <TextArea
        className={styles.textarea}
        placeholder={t(
          'viz-ai-section.prompt-placeholder',
          'Describe the visualization you want, e.g. "Switch to gauge with three thresholds: 0–30 red, 31–60 yellow, 61+ green"'
        )}
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
        rows={5}
        disabled={isLoading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleApply();
          }
        }}
      />

      <Stack gap={1} justifyContent="flex-end">
        {previousState && (
          <Button
            variant="secondary"
            icon="history"
            onClick={handleUndo}
            disabled={isLoading}
            tooltip={t('viz-ai-section.undo-tooltip', 'Revert to state before last AI apply')}
          >
            {t('viz-ai-section.undo', 'Undo')}
          </Button>
        )}
        <Button
          variant="primary"
          onClick={handleApply}
          disabled={!prompt.trim() || isLoading}
          icon={isLoading ? undefined : 'ai'}
        >
          {isLoading ? (
            <Stack gap={1} alignItems="center">
              <Spinner size="sm" />
              {t('viz-ai-section.applying', 'Applying…')}
            </Stack>
          ) : (
            t('viz-ai-section.apply', 'Apply')
          )}
        </Button>
      </Stack>

      {error && (
        <Alert
          severity="error"
          title={t('viz-ai-section.error-title', 'AI request failed')}
          onRemove={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      <p className={styles.hint}>
        {t('viz-ai-section.hint', 'Tip: ⌘ Enter / Ctrl Enter to apply.')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apply AI response to the panel
// ---------------------------------------------------------------------------

function applyAIResponse(panel: VizPanel, response: VizAIResponse) {
  const hasTypeChange = response.panelType && response.panelType !== panel.state.pluginId;

  if (hasTypeChange) {
    // changePluginType resets options/fieldConfig, so pass the merged values directly
    const newOptions = response.options
      ? merge({}, panel.state.options, response.options)
      : panel.state.options;
    const newFieldConfig = response.fieldConfig
      ? mergeFieldConfig(panel.state.fieldConfig, response.fieldConfig)
      : panel.state.fieldConfig;
    panel.changePluginType(response.panelType!, newOptions, newFieldConfig);
    return;
  }

  if (response.options) {
    panel.onOptionsChange(merge({}, panel.state.options, response.options), true);
  }

  if (response.fieldConfig) {
    panel.onFieldConfigChange(mergeFieldConfig(panel.state.fieldConfig, response.fieldConfig), true);
  }
}

function mergeFieldConfig(
  current: FieldConfigSource,
  diff: NonNullable<VizAIResponse['fieldConfig']>
): FieldConfigSource {
  return {
    defaults: merge({}, current.defaults, diff.defaults ?? {}),
    // Replace overrides if the AI provided them; otherwise keep existing
    overrides: diff.overrides?.length ? (diff.overrides as FieldConfigSource['overrides']) : current.overrides,
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(2),
      padding: theme.spacing(2),
      height: '100%',
    }),
    textarea: css({
      resize: 'none',
      flexShrink: 0,
    }),
    hint: css({
      ...theme.typography.bodySmall,
      color: theme.colors.text.disabled,
      margin: 0,
    }),
  };
}
