export const OLLAMA_BASE = "http://localhost:11434";

export const PROVIDERS = {
  ollama:   { label: "Ollama (локально)", models: [], keyRequired: false },
  deepseek: { label: "DeepSeek",        models: ["deepseek-chat", "deepseek-reasoner"], keyRequired: true },
  openai:   { label: "OpenAI",          models: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"], keyRequired: true },
  anthropic:{ label: "Anthropic",       models: ["claude-3-haiku-20240307", "claude-3-5-sonnet-20240620"], keyRequired: true }
};

export const DEFAULT_PROVIDER = "deepseek";

export const DEFAULT_CLOUD_MODEL = {
  deepseek: "deepseek-chat",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-haiku-20240307"
};
