import { FieldConfigSource } from '@grafana/data';
import { DeepPartial } from '@grafana/scenes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelAIContext {
  pluginId: string;
  options: Record<string, unknown>;
  fieldConfig: FieldConfigSource;
}

/**
 * Partial panel configuration diff returned by the AI.
 * Only keys that should change are present; absent keys are left untouched.
 */
export interface VizAIResponse {
  panelType?: string;
  options?: Record<string, unknown>;
  fieldConfig?: DeepPartial<FieldConfigSource>;
}

export interface VizAIProvider {
  complete(prompt: string, context: PanelAIContext): Promise<VizAIResponse>;
}

// ---------------------------------------------------------------------------
// Anthropic provider — calls the Grafana backend proxy, never the API directly
// ---------------------------------------------------------------------------

export class AnthropicProvider implements VizAIProvider {
  async complete(prompt: string, context: PanelAIContext): Promise<VizAIResponse> {
    const resp = await fetch('/api/llm-poc/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, panelContext: context }),
    });

    if (!resp.ok) {
      let message = `Request failed (${resp.status})`;
      try {
        const body = await resp.json();
        message = body.message ?? message;
      } catch {
        // ignore parse error — keep the generic message
      }
      throw new Error(message);
    }

    const anthropicResp = await resp.json();
    const text: string | undefined = anthropicResp?.content?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from AI — no content block returned.');
    }

    try {
      return JSON.parse(text) as VizAIResponse;
    } catch {
      throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _provider: VizAIProvider | null = null;

export function getVizAIProvider(): VizAIProvider {
  if (!_provider) {
    _provider = new AnthropicProvider();
  }
  return _provider;
}
