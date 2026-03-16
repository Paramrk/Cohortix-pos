import { GoogleGenAI } from '@google/genai';

export type AIProvider = 'gemini' | 'openai' | 'ollama' | 'sambanova';

const STORAGE_KEY_PROVIDER = 'cohortix_ai_provider';
const STORAGE_KEY_KEY = 'cohortix_ai_key';
const STORAGE_KEY_OLLAMA_URL = 'cohortix_ollama_url';
const STORAGE_KEY_OLLAMA_MODEL = 'cohortix_ollama_model';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  /** Ollama only: base URL, e.g. http://localhost:11434 */
  ollamaUrl?: string;
  /** Ollama only: model name, e.g. llama3, mistral, phi3 */
  ollamaModel?: string;
}

/** Read config: localStorage overrides env vars, env vars are fallback defaults. */
export function getAIConfig(): AIConfig {
  const storedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER) as AIProvider | null;
  const storedKey = localStorage.getItem(STORAGE_KEY_KEY) ?? '';
  const ollamaUrl = localStorage.getItem(STORAGE_KEY_OLLAMA_URL) ?? 'http://localhost:11434';
  const ollamaModel = localStorage.getItem(STORAGE_KEY_OLLAMA_MODEL) ?? 'llama3';

  // Ollama: may or may not have a cloud API key
  if (storedProvider === 'ollama') {
    return { provider: 'ollama', apiKey: storedKey.trim(), ollamaUrl, ollamaModel };
  }

  // Stored key for cloud providers
  if (storedProvider && storedKey.trim()) {
    return { provider: storedProvider, apiKey: storedKey.trim(), ollamaUrl, ollamaModel };
  }

  // Fall back to env vars
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (geminiKey?.trim()) return { provider: 'gemini', apiKey: geminiKey.trim(), ollamaUrl, ollamaModel };

  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (openaiKey?.trim()) return { provider: 'openai', apiKey: openaiKey.trim(), ollamaUrl, ollamaModel };

  const sambanovaKey = import.meta.env.VITE_SAMBANOVA_API_KEY as string | undefined;
  if (sambanovaKey?.trim()) return { provider: 'sambanova', apiKey: sambanovaKey.trim(), ollamaUrl, ollamaModel };

  return { provider: storedProvider ?? 'gemini', apiKey: '', ollamaUrl, ollamaModel };
}

export function saveAIConfig(config: AIConfig) {
  localStorage.setItem(STORAGE_KEY_PROVIDER, config.provider);
  localStorage.setItem(STORAGE_KEY_KEY, config.apiKey);
  if (config.ollamaUrl) localStorage.setItem(STORAGE_KEY_OLLAMA_URL, config.ollamaUrl);
  if (config.ollamaModel) localStorage.setItem(STORAGE_KEY_OLLAMA_MODEL, config.ollamaModel);
}

export function isAIConfigured(config?: AIConfig): boolean {
  const c = config ?? getAIConfig();
  // Ollama local needs no key; Ollama cloud needs a key but URL alone is enough to try
  if (c.provider === 'ollama') return Boolean(c.ollamaUrl?.trim());
  return Boolean(c.apiKey && c.apiKey.trim().length > 0);
}

// ─── Providers ────────────────────────────────────────────────────────────────

async function askGemini(prompt: string, apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });
  return response.text ?? '';
}

/** Works for both OpenAI and Ollama (OpenAI-compatible API). */
async function askOpenAICompat(
  prompt: string,
  baseUrl: string,
  model: string,
  apiKey?: string,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (err.error as Record<string, unknown> | undefined)?.message ?? response.statusText;
    throw new Error(`${baseUrl} error: ${String(msg)}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

// ─── Unified entry point ──────────────────────────────────────────────────────

export async function askAI(prompt: string, config?: AIConfig): Promise<string> {
  const c = config ?? getAIConfig();

  if (c.provider === 'ollama') {
    const url = (c.ollamaUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    const model = c.ollamaModel ?? 'llama3';
    // Pass API key if set (Ollama cloud), omit if local
    return askOpenAICompat(prompt, url, model, c.apiKey || undefined);
  }

  if (c.provider === 'sambanova') {
    if (!c.apiKey) throw new Error('SambaNova API key not set. Open AI settings to add it.');
    return askOpenAICompat(prompt, 'https://api.sambanova.ai', 'Meta-Llama-3.3-70B-Instruct', c.apiKey);
  }

  if (c.provider === 'openai') {
    if (!c.apiKey) throw new Error('OpenAI API key not set. Open AI settings to add it.');
    return askOpenAICompat(prompt, 'https://api.openai.com', 'gpt-4o-mini', c.apiKey);
  }

  // Gemini
  if (!c.apiKey) throw new Error('Gemini API key not set. Open AI settings to add it.');
  return askGemini(prompt, c.apiKey);
}
