const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const qa=path.join(__dirname,'.qa');fs.mkdirSync(qa,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(qa,'progress-ui-')));
require('./main');
for(const action of ['gateway','metrics','setup-check','local-status','local-prepare'])ipcMain.removeHandler(action);
const {MODELS,DEFAULT_MODEL}=require('./local-model.cjs');
ipcMain.handle('gateway',()=>({ok:false}));
ipcMain.handle('metrics',()=>({memoryTotal:13*1024**3}));
ipcMain.handle('setup-check',()=>({wsl:{distributions:[]},tailscale:{status:'not-installed'}}));
ipcMain.handle('local-status',()=>({phase:'idle',model:DEFAULT_MODEL,models:MODELS}));
ipcMain.handle('local-prepare',()=>({busy:true}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 try{
  const win=BrowserWindow.getAllWindows()[0];win.setContentSize(1268,666);
  if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
  await wait(300);
  await win.webContents.executeJavaScript(`document.querySelector('[data-role=host]').click()`);await wait(150);
  await win.webContents.executeJavaScript(`document.querySelector('[data-action=prepare-local]').click()`);await wait(100);
  const visible=await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('#local-progress-title').getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight&&document.activeElement.id==='local-setup-progress';})()`);
  if(!visible)throw Error('Starting setup did not reveal and focus progress');
  const progress={phase:'downloading-model',model:DEFAULT_MODEL,busy:true,verified:false,message:'Downloading model files.',detail:'pulling abc123',total:1000,completed:1};
  win.webContents.send('local-progress',progress);await wait(70);
  await win.webContents.executeJavaScript(`(()=>{document.querySelector('#local-setup-progress details').open=true;document.querySelector('.page-scroll').scrollTop=125;})()`);
  for(let i=2;i<12;i++){win.webContents.send('local-progress',{...progress,completed:i});await wait(40);}
  const preserved=await win.webContents.executeJavaScript(`({scroll:document.querySelector('.page-scroll').scrollTop,focus:document.activeElement.id,details:document.querySelector('#local-setup-progress details').open})`);
  if(preserved.scroll!==125||preserved.focus!=='local-setup-progress'||!preserved.details)throw Error('Progress lost UI state: '+JSON.stringify(preserved));
  win.webContents.send('local-progress',{...progress,busy:false,phase:'attention',error:'Network interrupted'});await wait(70);
  const terminal=await win.webContents.executeJavaScript(`!document.querySelector('[data-action=prepare-local]').disabled && document.querySelector('#local-setup-progress').textContent.includes('Network interrupted')`);
  if(!terminal)throw Error('Error/retry state did not render');
  fs.writeFileSync(path.join(qa,'setup-progress.png'),(await win.webContents.capturePage()).toPNG());
  console.log('Setup progress: initial visibility, scroll, focus, details, and error/retry passed at 1268x666.');app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
