const { ipcMain, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const setup = require('./setup');
const {clawArgs}=require('./host-manager');
const {parseAgents}=require('./openclaw-native.cjs');
const commands = Object.freeze({
  windows: 'wsl --install -d Ubuntu-24.04',
  runtime: 'curl -fsSL https://openclaw.ai/install.sh | bash',
  provider: 'openclaw onboard',
  service: 'openclaw gateway install && openclaw gateway start && openclaw gateway status --json'
});
module.exports = function register({ getState, persist, isBusy, run }) {
  const ensureIdle = () => { if (isBusy()) throw Error('Wait for the current reply before changing conversations or connections.'); };
  const archive = state => {
    state.conversations ||= [];
    if (state.chat.length) state.conversations.unshift({ id: state.session, title: state.chat.find(m => m.role === 'user')?.text.slice(0,64) || 'Conversation', chat: state.chat, connection: state.connection || null });
  };
  const agents = async distro => {
    const inventory = await setup.inspect();
    if (!inventory.wsl?.distributions.some(d => d.name === distro)) throw Error('Choose an installed Linux environment.');
    return parseAgents(await run('wsl.exe', clawArgs(distro, ['agents', 'list', '--json'])));
  };
  // Switching to a different agent (or from Ubuntu to native OpenClaw) starts a
  // fresh session; the previous conversation is archived, never carried over.
  const where = c => `${c?.backbone || 'wsl'}:${c?.backbone === 'openclaw' ? '' : c?.distro || 'Ubuntu-24.04'}:${c?.agentId || 'main'}`;
  const connect = (state, connection) => {
    if (where(state.connection) !== where(connection)) { archive(state); state.chat = []; state.session = `agent:${connection.agentId || 'main'}:command-center-${crypto.randomUUID()}`; }
    state.connection = connection;
  };
  ipcMain.handle('setup-agents', (_, distro) => agents(distro));
  ipcMain.handle('setup-connect', async (_, choice) => {
    ensureIdle();
    if (!choice || typeof choice.distro !== 'string') throw Error('Choose your Linux environment.');
    const found = await agents(choice.distro);
    const agent = found.find(a => a.id === choice.agentId);
    if (!agent) throw Error('Select an agent found in this environment.');
    const check = await setup.inspectWslHost(choice.distro);
    if (check.gateway !== 'reachable') throw Error('The gateway is not reachable. Complete the background-service step and check again.');
    ensureIdle();
    const state = getState();
    connect(state, { distro: choice.distro, agentId: agent.id, agentName: agent.name });
    state.setup = setup.update(state.setup, { role: 'host', step: 'conversation', agentName: agent.name });
    persist(); return state;
  });
  ipcMain.handle('conversation-new', () => {
    ensureIdle(); const state = getState(); archive(state); state.chat = [];
    state.session = `agent:${state.connection?.agentId || 'main'}:command-center-${crypto.randomUUID()}`;
    persist(); return state;
  });
  ipcMain.handle('conversation-select', (_, id) => {
    ensureIdle(); const state = getState();
    const selected = state.conversations?.find(c => c.id === id);
    if (!selected) throw Error('That conversation is no longer available.');
    state.conversations = state.conversations.filter(c => c.id !== id); archive(state);
    state.chat = selected.chat; state.session = selected.id; state.connection = selected.connection; persist(); return state;
  });
  ipcMain.handle('setup-command', async (_, choice) => {
    if (!choice || !Object.hasOwn(commands, choice.step)) throw Error('Unknown setup action.');
    const command = commands[choice.step];
    if (choice.step !== 'windows') {
      const inventory = await setup.inspect();
      if (!inventory.wsl?.distributions.some(d => d.name === choice.distro)) throw Error('Install and initialize Ubuntu first, then check this PC again.');
    }
    // Electron 44: clipboard writes are asynchronous; wait so the command is there before the terminal opens.
    await clipboard.writeText(command);
    if (choice.copyOnly) return { copied: true };
    // The user's click opens an interactive terminal. They paste the displayed command.
    let child;
    if (choice.step === 'windows') {
      child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoExit'"], { windowsHide: true, stdio: 'ignore' });
    } else {
      child = spawn('wsl.exe', ['-d', choice.distro], { windowsHide: false, detached: true, stdio: 'ignore' });
    }
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(Error('Could not open the terminal. The command is copied; open the appropriate terminal from Start.'))); });
    child.unref(); return { copied: true, launched: true };
  });
  return { connect };
};
