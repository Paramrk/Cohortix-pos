import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, Settings, RefreshCw, Minimize2 } from 'lucide-react';
import { askAI, getAIConfig, saveAIConfig, isAIConfigured } from '../lib/ai';
import type { AIConfig, AIProvider } from '../lib/ai';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful AI assistant for Cohortix POS — a point-of-sale system for an ice cream / gola shop in India.
You help the staff with quick questions about orders, menu items, pricing, operations, and general business advice.
Keep answers concise (2–4 sentences max). Use Rs for currency. Be friendly and practical.`;

const PROVIDER_KEYS: AIProvider[] = ['gemini', 'openai', 'ollama', 'sambanova'];
const PROVIDER_NAMES: Record<AIProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  ollama: 'Ollama',
  sambanova: 'SambaNova',
};

/** Simple bold + bullet markdown renderer */
function SimpleMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-0.5" />;
        const parsed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        const isBulletOrNum = /^[-•*\d]/.test(line.trim());
        return (
          <div key={i} className={isBulletOrNum ? 'flex gap-1.5' : ''}>
            {isBulletOrNum && (
              <span className="text-indigo-400 font-bold shrink-0 mt-0.5">
                {/^\d/.test(line.trim()) ? line.match(/^\d+\./)?.[0] : '•'}
              </span>
            )}
            <span
              className="text-slate-700"
              dangerouslySetInnerHTML={{
                __html: isBulletOrNum ? parsed.replace(/^[-•*\d]+\.?\s*/, '') : parsed,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Inline key setup ─────────────────────────────────────────────────────────

function QuickSetup({ onSave }: { onSave: (c: AIConfig) => void }) {
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');

  function handleSave() {
    onSave({ provider, apiKey: apiKey.trim(), ollamaUrl, ollamaModel });
  }

  const isOllama = provider === 'ollama';
  const canSave = isOllama ? Boolean(ollamaUrl.trim()) : Boolean(apiKey.trim());

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Choose AI Provider</p>
      <div className="grid grid-cols-2 gap-1.5">
        {PROVIDER_KEYS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setProvider(p)}
            className={`py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors ${
              provider === p
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {PROVIDER_NAMES[p]}
          </button>
        ))}
      </div>

      {isOllama ? (
        <>
          <input
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
          />
          <input
            type="text"
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
            placeholder="llama3"
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
          />
        </>
      ) : (
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === 'sambanova' ? 'sn-…' : provider === 'openai' ? 'sk-…' : 'AIza…'}
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
        />
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs py-2 rounded-lg transition-colors"
      >
        Start Chat
      </button>
    </div>
  );
}

// ─── Main chatbot ─────────────────────────────────────────────────────────────

export function AIChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<AIConfig>(() => getAIConfig());
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const configured = isAIConfigured(config);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function handleSaveConfig(c: AIConfig) {
    saveAIConfig(c);
    setConfig(c);
    setShowSettings(false);
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setLoading(true);

    const newMessages: Message[] = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);

    try {
      // Build a short history context (last 6 messages)
      const history = newMessages
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const prompt = `${SYSTEM_PROMPT}\n\nConversation so far:\n${history}\n\nRespond as Assistant:`;
      const response = await askAI(prompt, config);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.trim() }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${err instanceof Error ? err.message : 'Unknown error'}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const providerLabel = PROVIDER_NAMES[config.provider] ?? config.provider;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="AI Chat"
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] md:bottom-6 right-4 md:right-6 z-40 w-13 h-13 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-slate-700 rotate-90 scale-95'
            : 'bg-gradient-to-br from-indigo-600 to-violet-600 hover:scale-110 hover:shadow-indigo-300/50'
        }`}
        style={{ width: '52px', height: '52px' }}
      >
        {open ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Sparkles className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Chat popup */}
      {open && (
        <div
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] md:bottom-24 right-4 md:right-6 z-40 w-[calc(100vw-2rem)] max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: '480px' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="bg-white/20 rounded-lg p-1.5">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-white leading-none">POS Assistant</p>
                <p className="text-[10px] text-indigo-200 mt-0.5">
                  {configured ? providerLabel : 'Setup required'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                title="Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                  title="Clear chat"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Settings panel */}
          {showSettings ? (
            <div className="flex-1 overflow-y-auto">
              <QuickSetup onSave={handleSaveConfig} />
            </div>
          ) : !configured ? (
            <div className="flex-1 overflow-y-auto">
              <QuickSetup onSave={handleSaveConfig} />
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center gap-3 pb-4">
                    <div className="bg-indigo-100 rounded-2xl p-4">
                      <Sparkles className="w-7 h-7 text-indigo-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700">Hi! I'm your POS assistant.</p>
                      <p className="text-xs text-slate-400 mt-1">Ask me anything about orders, menu, or sales.</p>
                    </div>
                    {/* Quick prompts */}
                    <div className="w-full space-y-1.5 px-1">
                      {[
                        'What items should I promote today?',
                        'How can I reduce unpaid orders?',
                        'Tips to increase average order value?',
                      ].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => { setInput(q); inputRef.current?.focus(); }}
                          className="w-full text-left text-xs px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        msg.role === 'user' ? 'bg-indigo-100' : 'bg-violet-100'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <User className="w-3 h-3 text-indigo-600" />
                      ) : (
                        <Bot className="w-3 h-3 text-violet-600" />
                      )}
                    </div>
                    <div
                      className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white text-sm'
                          : 'bg-white border border-slate-100 shadow-sm'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      ) : (
                        <SimpleMarkdown text={msg.content} />
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-2">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                      <Bot className="w-3 h-3 text-violet-600" />
                    </div>
                    <div className="bg-white border border-slate-100 shadow-sm rounded-2xl px-3 py-2.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSend}
                className="border-t border-slate-100 flex items-center gap-2 px-3 py-2.5 bg-white shrink-0"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything…"
                  className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl p-2 transition-colors"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
