'use strict';

const PROVIDERS = Object.freeze({
  // The backbone. Listed so Models can show and keep it selected; main.js
  // routes its messages to the OpenClaw agent (openclaw-native.cjs), never
  // through completeChat or probeProvider.
  openclaw: {
    id: 'openclaw',
    label: 'Your OpenClaw assistant (this PC)',
    vendor: 'OpenClaw',
    kind: 'openclaw',
    models: [],
    defaultModel: require('./local-model.cjs').DEFAULT_MODEL,
    keyEnv: null,
    keyHint: '',
  },
  openai: {
    id: 'openai',
    label: 'ChatGPT',
    vendor: 'OpenAI',
    kind: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1', 'gpt-4o', 'gpt-4.1-mini'],
    defaultModel: 'gpt-4.1',
    keyEnv: 'OPENAI_API_KEY',
    keyHint: 'sk-…',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude',
    vendor: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-5',
    keyEnv: 'ANTHROPIC_API_KEY',
    keyHint: 'sk-ant-…',
  },
  xai: {
    id: 'xai',
    label: 'Grok',
    vendor: 'xAI',
    kind: 'openai-compat',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-4', 'grok-3', 'grok-3-mini'],
    defaultModel: 'grok-4',
    keyEnv: 'XAI_API_KEY',
    keyHint: 'xai-…',
  },
  local: {
    id: 'local',
    label: 'Local (this PC)',
    vendor: 'Rennie',
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: [],
    defaultModel: process.env.RENNIE_SPARKY_MODEL || require('./local-model.cjs').DEFAULT_MODEL,
    keyEnv: null,
    keyHint: '',
  },
});

function listProviders() {
  return Object.values(PROVIDERS).map(({ id, label, vendor, models, defaultModel, keyHint, kind }) => ({
    id, label, vendor, models, defaultModel, keyHint, kind, needsKey: kind !== 'ollama' && kind !== 'openclaw',
  }));
}

function getProvider(id) {
  return PROVIDERS[id] || null;
}

function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length < 8) return '••••';
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

function pickOpenAiText(payload) {
  const message = payload?.choices?.[0]?.message;
  return stripThink(message?.content) || stripThink(message?.reasoning);
}

function splitSystem(messages) {
  const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n\n');
  const rest = messages.filter((item) => item.role !== 'system').map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: item.content,
  }));
  return { system, rest };
}

async function completeOpenAi({ baseUrl, apiKey, model, messages, maxTokens }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `ChatGPT/Grok ${response.status}`);
  }
  const content = pickOpenAiText(payload);
  if (!content) throw new Error(`${model} returned an empty reply`);
  return { content, model: payload.model || model, providerId: null };
}

async function completeAnthropic({ apiKey, model, messages, maxTokens }) {
  const { system, rest } = splitSystem(messages);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      system: system || undefined,
      messages: rest,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Claude ${response.status}`);
  }
  const content = stripThink((payload.content || []).map((block) => block.text).filter(Boolean).join('\n'));
  if (!content) throw new Error(`${model} returned an empty reply`);
  return { content, model: payload.model || model, providerId: 'anthropic' };
}

async function completeOllama({ model, messages, maxTokens }) {
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      options: { num_predict: maxTokens, temperature: 0.4 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Local model ${response.status}`);
  const content = stripThink(payload?.message?.content) || stripThink(payload?.message?.reasoning);
  if (!content) throw new Error(`${model} returned an empty reply`);
  return { content, model: payload.model || model, providerId: 'local' };
}

async function completeChat({ providerId, model, apiKey, messages, maxTokens = 1024 }) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error('Choose ChatGPT, Claude, Grok, or a local model in Rennie.');
  const chosenModel = model || provider.defaultModel;
  if (provider.kind === 'ollama') {
    return { ...(await completeOllama({ model: chosenModel, messages, maxTokens })), providerId: 'local' };
  }
  const key = (apiKey || process.env[provider.keyEnv] || '').trim();
  if (!key) throw new Error(`Add your ${provider.label} API key in Rennie settings.`);
  if (provider.kind === 'anthropic') {
    return { ...(await completeAnthropic({ apiKey: key, model: chosenModel, messages, maxTokens })), providerId: 'anthropic' };
  }
  return {
    ...(await completeOpenAi({
      baseUrl: provider.baseUrl,
      apiKey: key,
      model: chosenModel,
      messages,
      maxTokens,
    })),
    providerId: provider.id,
  };
}

async function probeProvider({ providerId, apiKey, model }) {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, error: 'Unknown provider' };
  const started = Date.now();
  try {
    if (provider.kind === 'ollama') {
      const response = await fetch('http://127.0.0.1:11434/api/tags', { cache: 'no-store' });
      return { ok: response.ok, status: response.status, ms: Date.now() - started, providerId, model: model || provider.defaultModel };
    }
    const key = (apiKey || process.env[provider.keyEnv] || '').trim();
    if (!key) return { ok: false, ms: Date.now() - started, providerId, error: 'No API key' };
    if (provider.kind === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      });
      return { ok: response.ok, status: response.status, ms: Date.now() - started, providerId };
    }
    const response = await fetch(`${provider.baseUrl}/models`, {
      headers: { authorization: `Bearer ${key}` },
    });
    return { ok: response.ok, status: response.status, ms: Date.now() - started, providerId };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, providerId, error: error.message };
  }
}

module.exports = {
  PROVIDERS,
  listProviders,
  getProvider,
  maskKey,
  completeChat,
  probeProvider,
};
