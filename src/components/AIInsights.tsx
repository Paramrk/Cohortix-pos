import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, RefreshCw, Bot, User, Settings, X, Eye, EyeOff, Check } from 'lucide-react';
import { askAI, getAIConfig, saveAIConfig, isAIConfigured } from '../lib/ai';
import type { AIConfig, AIProvider } from '../lib/ai';
import type { Order, Expense } from '../types';

interface ProductStat {
  name: string;
  quantitySold: number;
  orderCount: number;
}

interface AIInsightsProps {
  rangeLabel: string;
  totalSales: number;
  collected: number;
  netProfit: number;
  orderCount: number;
  itemsSold: number;
  avgOrderValue: number;
  expensesTotal: number;
  collectionRate: number;
  topProducts: ProductStat[];
  bottomProducts: ProductStat[];
  paymentBreakdown: {
    cash: { total: number; count: number };
    upi: { total: number; count: number };
    unpaid: { total: number; count: number };
  };
  analyticsOrders: Order[];
  analyticsExpenses: Expense[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const PROVIDER_LABELS: Record<AIProvider, { label: string; placeholder: string; hint: string; noKey?: boolean }> = {
  gemini: {
    label: 'Google Gemini',
    placeholder: 'AIza…',
    hint: 'aistudio.google.com/apikey',
  },
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-…',
    hint: 'platform.openai.com/api-keys (uses gpt-4o-mini)',
  },
  ollama: {
    label: 'Ollama (Local)',
    placeholder: '',
    hint: 'ollama.com — runs fully offline on your machine',
    noKey: true,
  },
  sambanova: {
    label: 'SambaNova',
    placeholder: 'sn-…',
    hint: 'cloud.sambanova.ai — uses Meta-Llama-3.3-70B',
  },
};

// ─── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({
  config,
  onSave,
  onClose,
}: {
  config: AIConfig;
  onSave: (c: AIConfig) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<AIProvider>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState(config.ollamaUrl ?? 'http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState(config.ollamaModel ?? 'llama3');
  const [saved, setSaved] = useState(false);

  const info = PROVIDER_LABELS[provider];

  function handleSave() {
    onSave({ provider, apiKey: apiKey.trim(), ollamaUrl: ollamaUrl.trim(), ollamaModel: ollamaModel.trim() });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  const canSave = provider === 'ollama' ? Boolean(ollamaUrl.trim() && ollamaModel.trim()) : Boolean(apiKey.trim());

  return (
    <div className="mt-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800">AI Provider Settings</h4>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Provider selector */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Provider</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={`py-2.5 px-2 rounded-xl border text-xs font-semibold transition-colors ${
                provider === p
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {PROVIDER_LABELS[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* Ollama fields */}
      {provider === 'ollama' && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            For <strong>local</strong> Ollama leave the API key blank. For <strong>Ollama cloud</strong>, paste your API key below.
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Base URL</p>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">Ollama cloud: <span className="font-mono">https://api.ollama.com</span></p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Model</p>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="llama3"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">e.g. llama3, mistral, phi3, gemma3, qwen2.5</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">API Key <span className="normal-case font-normal">(cloud only — leave blank for local)</span></p>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ollama_…"
                className="w-full pr-10 px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* API key for cloud providers */}
      {!info.noKey && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">API Key</p>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={info.placeholder}
              className="w-full pr-10 px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {info.hint}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm py-2.5 rounded-xl transition-colors"
        >
          {saved ? <Check className="w-4 h-4" /> : null}
          {saved ? 'Saved!' : 'Save & Apply'}
        </button>
        {!info.noKey && (
          <button
            type="button"
            onClick={() => { setApiKey(''); }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Context prompt builder ────────────────────────────────────────────────────

function buildContext(props: AIInsightsProps): string {
  const fmt = (n: number) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;

  const topList = props.topProducts
    .slice(0, 5)
    .map((p) => `  - ${p.name}: ${p.quantitySold} qty, ${p.orderCount} orders`)
    .join('\n');

  const bottomList = props.bottomProducts
    .slice(0, 5)
    .map((p) => `  - ${p.name}: ${p.quantitySold} qty, ${p.orderCount} orders`)
    .join('\n');

  const hourMap = new Map<number, number>();
  for (const order of props.analyticsOrders) {
    if (order.status === 'cancelled') continue;
    const hour = new Date(order.timestamp).getHours();
    hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
  }
  const peakHour = [...hourMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const peakHourStr = peakHour
    ? `${peakHour[0]}:00–${peakHour[0] + 1}:00 (${peakHour[1]} orders)`
    : 'N/A';

  return `You are an AI analytics assistant for a small Indian ice-cream / gola POS (Cohortix POS).

Analytics snapshot — ${props.rangeLabel} view:

FINANCIAL: Total billed ${fmt(props.totalSales)} | Collected ${fmt(props.collected)} | Expenses ${fmt(props.expensesTotal)} | Net Profit ${fmt(props.netProfit)} | Collection rate ${props.collectionRate}% | Avg order ${fmt(props.avgOrderValue)}
ORDERS: ${props.orderCount} orders | ${props.itemsSold} items sold | Peak hour ${peakHourStr}
PAYMENT: Cash ${fmt(props.paymentBreakdown.cash.total)} (${props.paymentBreakdown.cash.count} orders) | UPI ${fmt(props.paymentBreakdown.upi.total)} (${props.paymentBreakdown.upi.count} orders) | Unpaid due ${fmt(props.paymentBreakdown.unpaid.total)} (${props.paymentBreakdown.unpaid.count} orders)
TOP PRODUCTS:\n${topList || '  (none)'}
BOTTOM PRODUCTS:\n${bottomList || '  (none)'}
RECENT EXPENSES:\n${props.analyticsExpenses.slice(0, 5).map((e) => `  - ${e.description}: ${fmt(e.amount)}`).join('\n') || '  (none)'}`;
}

/** Simple bold + numbered/bullet markdown renderer */
function SimpleMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const parsed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        const isNumbered = /^\d+\./.test(line.trim());
        const isBullet = /^[-•*]/.test(line.trim());
        return (
          <div key={i} className={isNumbered || isBullet ? 'flex gap-2' : ''}>
            {(isNumbered || isBullet) && (
              <span className="text-indigo-500 font-bold shrink-0 mt-0.5">
                {isNumbered ? line.match(/^\d+\./)?.[0] : '•'}
              </span>
            )}
            <span
              className="text-slate-700"
              dangerouslySetInnerHTML={{
                __html: isNumbered
                  ? parsed.replace(/^\d+\.\s*/, '')
                  : isBullet
                  ? parsed.replace(/^[-•*]\s*/, '')
                  : parsed,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AIInsights(props: AIInsightsProps) {
  const [config, setConfig] = useState<AIConfig>(() => getAIConfig());
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('cohortix_ai_insights_messages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const configured = isAIConfigured(config);

  useEffect(() => {
    try {
      localStorage.setItem('cohortix_ai_insights_messages', JSON.stringify(messages));
    } catch {
      // Ignore
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, loading, isOpen]);

  function handleSaveConfig(c: AIConfig) {
    saveAIConfig(c);
    setConfig(c);
    setShowSettings(false);
  }

  async function handleAutoInsights() {
    setAutoLoading(true);
    setIsOpen(true);
    setShowSettings(false);
    try {
      const prompt = `${buildContext(props)}\n\nGive me 5 concise actionable insights for the owner. Numbered list, 1–2 sentences each. Focus on profit, top/bottom sellers, payment collection, and cost control. Use Rs for currency.`;
      const response = await askAI(prompt, config);
      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${err instanceof Error ? err.message : 'Unknown error'}` },
      ]);
    } finally {
      setAutoLoading(false);
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    try {
      const prompt = `${buildContext(props)}\n\nQuestion: ${q}\n\nAnswer concisely and specifically. Use Rs for currency.`;
      const response = await askAI(prompt, config);
      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${err instanceof Error ? err.message : 'Unknown error'}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const providerLabel = PROVIDER_LABELS[config.provider]?.label ?? config.provider;

  return (
    <div className="mb-6">
      {/* Header bar */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-white/20 rounded-xl p-2.5">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">AI Analytics Assistant</h3>
            <p className="text-xs text-indigo-200">
              {configured ? `${providerLabel} · ${props.rangeLabel} data` : 'Configure an AI provider below'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {configured && (
            <button
              type="button"
              disabled={autoLoading}
              onClick={handleAutoInsights}
              className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold text-xs px-3.5 py-2 rounded-xl hover:bg-indigo-50 transition-colors disabled:opacity-60"
            >
              {autoLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {autoLoading ? 'Analysing…' : 'Generate Insights'}
            </button>
          )}
          <button
            type="button"
            onClick={() => { setShowSettings((s) => !s); setIsOpen(true); }}
            title="AI Settings"
            className={`inline-flex items-center gap-1.5 font-semibold text-xs px-3 py-2 rounded-xl transition-colors ${
              showSettings
                ? 'bg-white text-indigo-700'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            {configured ? providerLabel : 'Setup'}
          </button>
          {messages.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setMessages([])}
                className="inline-flex items-center gap-1.5 bg-white/20 text-white font-semibold text-xs px-3 py-2 rounded-xl hover:bg-white/30 transition-colors"
              >
                Clear Chat
              </button>
              <button
                type="button"
                onClick={() => setIsOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 bg-white/20 text-white font-semibold text-xs px-3 py-2 rounded-xl hover:bg-white/30 transition-colors"
              >
                {isOpen ? 'Hide' : 'Show'} chat
              </button>
            </>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          config={config}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Chat panel */}
      {!showSettings && isOpen && (
        <div className="mt-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div ref={scrollContainerRef} className="max-h-[420px] overflow-y-auto p-4 space-y-3">
            {!configured && messages.length === 0 && (
              <div className="text-center py-6 text-slate-400 text-sm">
                Click <strong>Setup</strong> above to add your API key.
              </div>
            )}
            {configured && messages.length === 0 && !autoLoading && (
              <div className="text-center py-6 text-slate-400 text-sm">
                Click <strong>Generate Insights</strong> or ask a question below.
              </div>
            )}
            {autoLoading && messages.length === 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                <span className="text-sm text-indigo-700">Analysing your data…</span>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    msg.role === 'user' ? 'bg-indigo-100' : 'bg-violet-100'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="w-3.5 h-3.5 text-indigo-600" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-violet-600" />
                  )}
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white text-sm'
                      : 'bg-slate-50 border border-slate-100'
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
              <div className="flex gap-2.5">
                <div className="shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          {configured && (
            <form
              onSubmit={handleSend}
              className="border-t border-slate-100 flex items-center gap-2 px-3 py-2.5"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your sales…"
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl p-2.5 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
