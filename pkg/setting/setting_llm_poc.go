package setting

// LLMPocSettings holds configuration for the PoC AI panel assistant.
type LLMPocSettings struct {
	AnthropicAPIKey string
}

func (cfg *Cfg) readLLMPocSettings() {
	sec := cfg.Raw.Section("llm_poc")
	cfg.LLMPoc.AnthropicAPIKey = sec.Key("anthropic_api_key").String()
}
