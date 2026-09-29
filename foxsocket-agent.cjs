'use strict';

const fs = require('fs');
const path = require('path');

const TEXT_FILES = ['TYPE.md', 'IDENTITY.md', 'SOUL.md', 'USER.md', 'HEARTBEAT.md'];
const FENCE = /:::foxsocket-graph\s*([\s\S]*?):::/i;

function templatesDir() {
  return path.join(__dirname, 'agent');
}

function liveDir(root) {
  return path.join(root, 'agent');
}

function copyIfMissing(from, to) {
  if (fs.existsSync(to)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function ensure(root) {
  const live = liveDir(root);
  const bundled = templatesDir();
  fs.mkdirSync(live, { recursive: true });
  for (const name of [...TEXT_FILES, 'GRAPH.json']) {
    copyIfMissing(path.join(bundled, name), path.join(live, name));
  }
  return live;
}

function readText(root, name) {
  const live = path.join(liveDir(root), name);
  try {
    return fs.readFileSync(live, 'utf8').trim();
  } catch {
    return fs.readFileSync(path.join(templatesDir(), name), 'utf8').trim();
  }
}

function emptyGraph() {
  return { version: 1, updatedAt: null, nodes: [], edges: [], facts: [], episodes: [] };
}

function loadGraph(root) {
  ensure(root);
  try {
    return { ...emptyGraph(), ...JSON.parse(fs.readFileSync(path.join(liveDir(root), 'GRAPH.json'), 'utf8')) };
  } catch {
    return emptyGraph();
  }
}

function saveGraph(root, graph) {
  const file = path.join(liveDir(root), 'GRAPH.json');
  const next = { ...emptyGraph(), ...graph, updatedAt: new Date().toISOString() };
  next.facts = (next.facts || []).slice(-80);
  next.episodes = (next.episodes || []).slice(-40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return next;
}

function applyPatch(graph, patch) {
  if (!patch || typeof patch !== 'object') return graph;
  const next = structuredClone(graph);
  const nodes = new Map((next.nodes || []).map((node) => [node.id, node]));
  for (const node of patch.nodes || []) {
    if (node && typeof node.id === 'string') nodes.set(node.id, { ...nodes.get(node.id), ...node });
  }
  next.nodes = [...nodes.values()];
  const edgeKey = (edge) => `${edge.from}|${edge.rel}|${edge.to}`;
  const edges = new Map((next.edges || []).map((edge) => [edgeKey(edge), edge]));
  for (const edge of patch.edges || []) {
    if (edge?.from && edge?.to && edge?.rel) edges.set(edgeKey(edge), edge);
  }
  next.edges = [...edges.values()];
  if (Array.isArray(patch.facts)) {
    next.facts = [...(next.facts || []), ...patch.facts.map((fact) => String(fact).slice(0, 280)).filter(Boolean)];
  }
  if (Array.isArray(patch.removeFacts)) {
    const drop = new Set(patch.removeFacts.map(String));
    next.facts = (next.facts || []).filter((fact) => !drop.has(fact));
  }
  return next;
}

function formatGraph(graph) {
  const nodes = (graph.nodes || []).map((node) => `- ${node.id}: ${node.label || node.id} (${node.kind || 'node'})`).join('\n');
  const edges = (graph.edges || []).map((edge) => `- ${edge.from} ${edge.rel} ${edge.to}`).join('\n');
  const facts = (graph.facts || []).slice(-24).map((fact) => `- ${fact}`).join('\n');
  const episodes = (graph.episodes || []).slice(-8).map((item) => `- ${item.at || ''}: ${item.summary || ''}`).join('\n');
  return [
    'RENNIE GRAPH (working memory)',
    `updated: ${graph.updatedAt || 'never'}`,
    'Nodes:',
    nodes || '- none',
    'Edges:',
    edges || '- none',
    'Facts:',
    facts || '- none yet',
    'Recent episodes:',
    episodes || '- none',
  ].join('\n');
}

function systemPrompt(root) {
  ensure(root);
  const graph = loadGraph(root);
  return [
    readText(root, 'TYPE.md'),
    readText(root, 'IDENTITY.md'),
    readText(root, 'SOUL.md'),
    readText(root, 'USER.md'),
    readText(root, 'HEARTBEAT.md'),
    formatGraph(graph),
    'When a fact, person, device, or relation should persist, end your reply with a machine block the human should not need to read:',
    ':::foxsocket-graph',
    '{"facts":["short remembered fact"],"nodes":[],"edges":[]}',
    ':::',
    'Omit the block if nothing in memory changed. Never claim a graph write you did not emit.',
  ].join('\n\n');
}

function absorbReply(root, reply, episode) {
  const match = String(reply || '').match(FENCE);
  let visible = String(reply || '').replace(FENCE, '').trim();
  let graph = loadGraph(root);
  if (match) {
    try {
      graph = applyPatch(graph, JSON.parse(match[1]));
    } catch {
      /* keep graph; leave a bad fence out of the bubble */
    }
  }
  if (episode?.summary) {
    graph.episodes = [...(graph.episodes || []), {
      at: new Date().toISOString(),
      summary: String(episode.summary).slice(0, 400),
    }];
  }
  saveGraph(root, graph);
  return { visible, graph };
}

module.exports = {
  TEXT_FILES,
  ensure,
  loadGraph,
  saveGraph,
  applyPatch,
  formatGraph,
  systemPrompt,
  absorbReply,
};
