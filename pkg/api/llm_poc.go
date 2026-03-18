package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/grafana/grafana/pkg/api/response"
	"github.com/grafana/grafana/pkg/api/routing"
	"github.com/grafana/grafana/pkg/middleware"
	contextmodel "github.com/grafana/grafana/pkg/services/contexthandler/model"
	"github.com/grafana/grafana/pkg/web"
)

const anthropicAPIURL = "https://api.anthropic.com/v1/messages"
const anthropicVersion = "2023-06-01"
const anthropicModel = "claude-3-5-sonnet-20241022"

const llmSystemPrompt = `You are a Grafana panel configuration assistant.
The user will describe a visualization change in plain English, along with the panel's current state.
Respond ONLY with a valid JSON object (no markdown fences, no explanation) containing a partial
panel configuration diff with any of these optional top-level keys:
  "panelType": string  — Grafana plugin id to switch to (e.g. "timeseries", "gauge", "barchart")
  "options":   object  — panel options to deep-merge into the current options
  "fieldConfig": { "defaults": {}, "overrides": [] }  — field config to deep-merge

Apply only the changes the user asks for. Omit keys that should not change.
For thresholds use this structure inside fieldConfig.defaults:
  "thresholds": { "mode": "absolute", "steps": [{"color":"red","value":0}, ...] }
For gauge mode use options.reduceOptions and fieldConfig.defaults.thresholds.`

// llmPocRequestDTO is the body the frontend sends.
type llmPocRequestDTO struct {
	Prompt       string          `json:"prompt"`
	PanelContext json.RawMessage `json:"panelContext"`
}

// anthropicRequest is what we send to the Anthropic API.
type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func (hs *HTTPServer) registerLLMPocAPI(r routing.RouteRegister) {
	r.Post("/api/llm-poc/complete", middleware.ReqSignedIn, routing.Wrap(hs.llmPocComplete))
}

// llmPocComplete proxies a natural-language panel configuration request to Anthropic.
// The API key is read from server config and never sent to the browser.
func (hs *HTTPServer) llmPocComplete(c *contextmodel.ReqContext) response.Response {
	apiKey := hs.Cfg.LLMPoc.AnthropicAPIKey
	if apiKey == "" {
		return response.Error(http.StatusServiceUnavailable,
			"AI assistant is not configured. Set anthropic_api_key in [llm_poc] section of custom.ini.", nil)
	}

	var req llmPocRequestDTO
	if err := web.Bind(c.Req, &req); err != nil {
		return response.Error(http.StatusBadRequest, "invalid request body", err)
	}
	if req.Prompt == "" {
		return response.Error(http.StatusBadRequest, "prompt is required", nil)
	}

	// Build a user message that includes the panel context and the prompt
	userContent := fmt.Sprintf("Current panel context:\n%s\n\nUser request: %s",
		string(req.PanelContext), req.Prompt)

	anthropicReq := anthropicRequest{
		Model:     anthropicModel,
		MaxTokens: 1024,
		System:    llmSystemPrompt,
		Messages: []anthropicMessage{
			{Role: "user", Content: userContent},
		},
	}

	body, err := json.Marshal(anthropicReq)
	if err != nil {
		return response.Error(http.StatusInternalServerError, "failed to build request", err)
	}

	httpReq, err := http.NewRequestWithContext(c.Req.Context(), http.MethodPost, anthropicAPIURL, bytes.NewReader(body))
	if err != nil {
		return response.Error(http.StatusInternalServerError, "failed to create request", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return response.Error(http.StatusBadGateway, "failed to reach Anthropic API", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return response.Error(http.StatusInternalServerError, "failed to read Anthropic response", err)
	}

	if resp.StatusCode != http.StatusOK {
		return response.Error(resp.StatusCode,
			fmt.Sprintf("Anthropic API error: %s", string(respBody)), nil)
	}

	// Return the raw Anthropic response — the frontend will parse content[0].text
	var result any
	if err := json.Unmarshal(respBody, &result); err != nil {
		return response.Error(http.StatusInternalServerError, "failed to parse Anthropic response", err)
	}
	return response.JSON(http.StatusOK, result)
}
