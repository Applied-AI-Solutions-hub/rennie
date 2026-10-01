'use strict';

const fs = require('fs');
const path = require('path');

function emptyConfig() {
  return {
    active: 'local',
    keys: { openai: '', anthropic: '', xai: '' },
    models: { openai: '', anthropic: '', xai: '', local: '', openclaw: '' },
  };
}
// 'openclaw' is the backbone: chat goes to the local OpenClaw agent, which
// runs the chosen Ollama model. The others remain optional direct connections.
const ACTIVE = ['openclaw', 'openai', 'anthropic', 'xai', 'local'];

function load(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const base = emptyConfig();
    return {
      active: ACTIVE.includes(parsed.active) ? parsed.active : 'local',
      keys: { ...base.keys, ...(parsed.keys || {}) },
      models: { ...base.models, ...(parsed.models || {}) },
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return emptyConfig();
  }
}

function save(file, patch) {
  const current = load(file);
  const next = {
    active: ACTIVE.includes(patch.active) ? patch.active : current.active,
    keys: { ...current.keys },
    models: { ...current.models },
  };
  for (const id of ['openai', 'anthropic', 'xai']) {
    if (typeof patch.keys?.[id] === 'string' && patch.keys[id].trim()) {
      next.keys[id] = patch.keys[id].trim();
    }
  }
  if (patch.models && typeof patch.models === 'object') {
    for (const [id, value] of Object.entries(patch.models)) {
      if (typeof value === 'string') next.models[id] = value.trim();
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return next;
}

function snapshot(file, llm) {
  const cfg = load(file);
  const provider = llm.getProvider(cfg.active);
  return {
    active: cfg.active,
    model: cfg.models[cfg.active] || provider?.defaultModel || '',
    catalog: llm.listProviders().map((item) => ({
      ...item,
      model: cfg.models[item.id] || item.defaultModel,
      hasKey: Boolean(cfg.keys[item.id]),
      masked: llm.maskKey(cfg.keys[item.id]),
    })),
  };
}

module.exports = { emptyConfig, load, save, snapshot };
