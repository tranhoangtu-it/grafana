# PoC Notes — Viz Configuration Redesign

## Phase 1 — Options Panel Vertical Sidebar

### What was added

| File | Change |
|------|--------|
| `packages/grafana-data/src/types/featureToggles.gen.ts` | Added `vizOptionsSidebar?: boolean` flag (manual addition — do not regenerate without re-applying) |
| `public/app/features/dashboard-scene/panel-edit/VizOptionsSidebar.tsx` | New component: vertical icon rail + section layout + AI/Styles placeholder sections |
| `public/app/features/dashboard-scene/panel-edit/PanelOptionsPane.tsx` | Modified to conditionally render sidebar layout when flag is on; default behavior unchanged |

### How to enable

In `conf/custom.ini` (create from `conf/sample.ini` if needed):

```ini
[feature_toggles]
vizOptionsSidebar = true
```

Then restart the Grafana server.

### What it does

When enabled, the panel editor's right-side options pane gains a narrow **40 px icon rail** on the right edge with four navigation sections:

| Icon | Section | Behaviour |
|------|---------|-----------|
| ✨ AI (`ai`) | AI | Natural language panel config (Phase 3) |
| ⚡ Styles (`bolt`) | Styles | Color palette picker + style presets (Phase 2) |
| ⚙ Options (`cog`) | Options | Full existing panel options UI (default active) |
| ⊟ Overrides (`sliders-v-alt`) | Overrides | Existing field overrides only |

- Default active section is **Options**.
- Switching sections does not affect existing panel state.
- The viz type picker (Change button) continues to work normally in all sections.
- Search is available in Options and Overrides sections.

### How to test

1. Enable the flag (see above) and restart.
2. Open any dashboard → Edit any **Time Series** or **Gauge** panel.
3. The right-side options pane should show the icon rail on its right edge.
4. Click each icon and verify:
   - **AI / Styles**: placeholder message visible.
   - **Options**: existing panel options render correctly.
   - **Overrides**: only field override categories render.
5. Disable the flag and verify the default panel editor is completely unaffected.

### Disabling / reverting

Remove or set to `false` in `custom.ini`:

```ini
[feature_toggles]
vizOptionsSidebar = false
```

---

---

## Phase 2 — Categorical Color Palettes

### What was added

| File | Change |
|------|--------|
| `public/app/features/dashboard-scene/panel-edit/palettes.ts` | Defines Paul Tol Bright, Paul Tol Muted, and Tableau 10 palettes; registers them into `fieldColorModeRegistry` at module load time |
| `public/app/features/dashboard-scene/panel-edit/VizStylesSection.tsx` | Palette picker UI (swatches + active highlight) + style preset card grid using plugin's registered presets supplier |
| `public/app/features/dashboard-scene/panel-edit/PanelOptions.tsx` | Added `skipStylesSection` prop to avoid showing presets in both the Options tab and Styles tab simultaneously |

### What it does

The Styles section (`bolt` icon) now shows:
1. **Color palette picker** — Classic (Grafana default) + Paul Tol Bright + Paul Tol Muted + Tableau 10, each shown with color swatches. Clicking a palette immediately applies `fieldConfig.defaults.color.mode` and persists on save.
2. **Style preset cards** — live-preview thumbnails of preset configurations for the current panel type (TimeSeries only for now). The presets are sourced from the plugin's registered `presetsSupplier`, so they respect the current data characteristics.

The three new palettes also appear in the **Color scheme** dropdown in the full Options panel (they are registered into the global registry at import time).

---

## Phase 3 — AI-Assisted Panel Configuration

### What was added

| File | Change |
|------|--------|
| `conf/defaults.ini` | New `[llm_poc]` section with `anthropic_api_key =` |
| `pkg/setting/setting_llm_poc.go` | `LLMPocSettings` struct + `readLLMPocSettings()` |
| `pkg/setting/setting.go` | Added `LLMPoc LLMPocSettings` field; calls `readLLMPocSettings()` at startup |
| `pkg/api/llm_poc.go` | `POST /api/llm-poc/complete` — reads API key server-side, proxies to Anthropic, returns response |
| `pkg/api/api.go` | Registers the LLM PoC route |
| `public/app/features/dashboard-scene/panel-edit/vizAI.ts` | `VizAIProvider` interface + `AnthropicProvider` class + `getVizAIProvider()` factory |
| `public/app/features/dashboard-scene/panel-edit/VizAISection.tsx` | AI section UI: prompt textarea, Apply button (⌘ Enter shortcut), Undo button, loading + error states |
| `public/app/features/dashboard-scene/panel-edit/PanelOptionsPane.tsx` | Wires `VizAISection` into the AI sidebar tab |

### How to enable

```ini
# conf/custom.ini  (do NOT commit this file)
[feature_toggles]
vizOptionsSidebar = true

[llm_poc]
anthropic_api_key = sk-ant-...
```

Or via environment variable (useful for CI / containers):
```bash
GF_LLM_POC_ANTHROPIC_API_KEY=sk-ant-...
```

Restart the Grafana server after changing either.

### Security

The API key **never leaves the server**. The browser calls `POST /api/llm-poc/complete` (a Grafana endpoint) with only the prompt and panel context. The Go handler reads the key from `Cfg.LLMPoc.AnthropicAPIKey` and makes the Anthropic request server-side. Only authenticated Grafana users can call the endpoint (`middleware.ReqSignedIn`).

### How to test

1. Set `anthropic_api_key` in `conf/custom.ini` and restart.
2. Enable `vizOptionsSidebar` feature toggle.
3. Open a dashboard → Edit a **Time Series** or **Gauge** panel.
4. Click the **AI (sparkle)** icon in the sidebar.
5. Try these prompts:
   - *"Switch to gauge, add three thresholds: 0–30 red, 31–60 yellow, 61+ green"*
   - *"Make this a time series, show legend at the bottom"*
   - *"Set fill opacity to 20"*
6. Click **Apply** (or ⌘ Enter / Ctrl Enter).
7. Verify the panel updates in real time.
8. Click **Undo** to revert to the pre-AI state.
9. Confirm in browser DevTools that no request goes to `api.anthropic.com` — only to `/api/llm-poc/complete`.

---

## Phases 4–5

Not yet implemented. See `poc_plan.md` for full details.
