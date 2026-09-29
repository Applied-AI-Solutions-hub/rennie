const {app,BrowserWindow,ipcMain,net}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const qa=path.join(__dirname,'.qa');fs.mkdirSync(qa,{recursive:true});
app.setPath('userData',path.join(qa,'design-'+Date.now()));
net.fetch=async()=>{throw Error('Offline design fixture');};
const errors=[];
app.on('web-contents-created',(_,wc)=>wc.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);}));
require('./main');
for(const name of ['gateway','metrics','setup-check','providers-get'])ipcMain.removeHandler(name);
ipcMain.handle('gateway',()=>({ok:true,provider:'local',model:'llama3.2:1b'}));
ipcMain.handle('metrics',()=>({cpu:4,memory:8e9,memoryTotal:16e9,cpuName:'Desktop processor'}));
ipcMain.handle('setup-check',()=>({wsl:{distributions:[]}}));
ipcMain.handle('providers-get',()=>({active:'local',model:'llama3.2:1b',catalog:[{id:'local',label:'Local model',needsKey:false},{id:'openai',label:'OpenAI',vendor:'OpenAI',needsKey:true}]}));
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];
 if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 const run=code=>win.webContents.executeJavaScript(code);
 const wait=()=>new Promise(r=>setTimeout(r,180));
 const capture=async name=>{await wait();fs.writeFileSync(path.join(qa,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await wait();win.setContentSize(1022,1035);await wait();
  await run(`document.querySelector('[data-page=chat]').click()`);await capture('quiet-empty');
  // Fixture content only; no cloud calls or modifications to the real profile.
  await run(`document.querySelector('.thread').innerHTML='<article class="message user"><div class="message-content"><div class="bubble"><p>Help me plan a small local AI workspace.</p></div></div></article><article class="message assistant"><div class="message-content"><div class="bubble"><p>Start with a workspace that is simple to use every day.</p><p><strong>Keep the conversation at the center.</strong> Use the sidebar to return to recent chats, find your folders, and manage your model.</p><p>Run a small model on this PC first. Once it replies reliably, add your project folders and a few useful tasks.</p></div><div class="message-actions"><button>Copy</button></div></div></article>'`);
  await capture('quiet-conversation');
  await run(`document.querySelector('[data-action=details]').click();if(document.querySelector('[data-action=details]').getAttribute('aria-expanded')!=='true')throw Error('Details expand');`);await capture('quiet-details');
  await run(`document.querySelector('[data-action=details]').click();document.querySelector('[data-page=setup]').click();document.querySelector('[data-role=host]').click();`);await wait();await capture('quiet-setup');
  await run(`document.querySelector('[data-page=settings]').click()`);await capture('quiet-settings');
  for(const size of [[1440,900],[1022,1035],[760,600]]){
   win.setContentSize(...size);await wait();
   for(const page of ['chat','setup','settings','devices','files','tasks']){
    await run(`document.querySelector('[data-page=${page}]').click()`);await wait();
    const result=await run(`({overflow:document.documentElement.scrollWidth>innerWidth, animations:document.querySelector('#content').getAnimations().length, composer:!document.querySelector('#chat-form')||document.querySelector('#chat-form').getBoundingClientRect().bottom<=innerHeight})`);
    if(result.overflow||result.animations||!result.composer)throw Error('Layout '+page+' '+JSON.stringify(size)+' '+JSON.stringify(result));
   }
   await run(`document.querySelector('[data-page=chat]').click()`);await capture('quiet-'+size[0]);
  }
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(qa,'design-results.json'),JSON.stringify({viewports:3,pages:6,detailsToggle:true,noPageAnimation:true,consoleErrors:errors},null,2));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(qa,'design-results.json'),JSON.stringify({error:error.stack,errors},null,2));app.exit(1);}
});
