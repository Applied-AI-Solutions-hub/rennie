// Same application, isolated development data. Never edits Windows policy.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const qa = path.join(root, '.qa');
fs.mkdirSync(qa, { recursive: true });
const requested=process.argv.indexOf('--dev-profile');
const profile = requested>=0 ? path.resolve(process.argv[requested+1]) : process.argv.includes('--fresh')
  ? fs.mkdtempSync(path.join(qa, 'dev-fresh-'))
  : path.join(qa, 'dev-profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.on('browser-window-created',(_,window)=>window.webContents.on('did-finish-load',()=>window.setTitle('Rennie — Development test')));
process.chdir(root);
console.log(`Rennie development profile: ${profile}`);
console.log('Isolated model engine; no sign-in task registration. Native OpenClaw gateway uses its own profile and port.');
if (process.argv.includes('--dev-smoke')) {
  const { BrowserWindow } = require('electron');
  app.whenReady().then(async () => {
    await new Promise(resolve => setImmediate(resolve));
    const win = BrowserWindow.getAllWindows()[0];
    try {
      if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
      const state = await win.webContents.executeJavaScript("desktop.invoke('state')");
      const rendered = await win.webContents.executeJavaScript("Boolean(document.querySelector('#content')?.textContent.trim())");
      if (!rendered) throw new Error('Development UI did not render');
      if (app.getVersion() !== require('../package.json').version) throw new Error('Wrong development version');
      if (!state.setup || app.getPath('userData') !== profile) throw new Error('Development profile failed');
      console.log('Isolated development launch passed.');
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
}
