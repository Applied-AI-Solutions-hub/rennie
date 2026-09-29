const {app,BrowserWindow,ipcMain,Tray,Menu,shell,dialog}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
// Preserve the existing profile when the display product name changes. Only the default folder moves: tests set their own
// before loading this file, and the development profile below replaces it afterwards.
if(app.getPath('userData')===path.join(app.getPath('appData'),app.getName()))app.setPath('userData',path.join(app.getPath('appData'),'Foxsocket'));
if (!app.isPackaged && process.argv.includes('--foxsocket-dev')) require('./dev-main.cjs');
const {execFile}=require('child_process');
let win,tray,quitting=false,busy=false; let state;
const brand=require('./branding');
const setup=require('./setup');
require('./updates-main')(()=>win);
const {clawArgs}=require('./host-manager');
const llm=require('./foxsocket-llm.cjs');
const providerStore=require('./foxsocket-providers.cjs');
const agentFiles=require('./foxsocket-agent.cjs');
const hostManager=require('./host-main')(()=>win,()=>busy);
const providersFile=()=>path.join(app.getPath('userData'),'foxsocket-providers.json');
const agentRoot=()=>app.getPath('userData');
let hostedVerified=false;
const localSetup=require('./local-main.cjs')(()=>win,model=>{
 // Selecting a model starts setup; OpenClaw only becomes the chat route once it has replied.
 const current=providerStore.load(providersFile()).active;
 providerStore.save(providersFile(),{active:current==='openclaw'?'openclaw':'local',models:{local:model,openclaw:model}});hostedVerified=false;
 if(state){state.setup=setup.update(state.setup,{role:'host',step:'provider'});persist();}
},ready=>{
 providerStore.save(providersFile(),{active:'openclaw',models:{openclaw:ready.agentModel||ready.model,local:ready.model}});
 if(!state)return;
 const agentName=ready.agentName||ready.agentDisplayName||null;
 workspace.connect(state,{backbone:'openclaw',agentId:ready.agentId||'main',agentName});
 state.setup=setup.update(state.setup,{role:'host',step:'conversation',...(agentName?{agentName}:{})});persist();
 if(win&&!win.isDestroyed())win.webContents.send('state',state);
});
const run=(exe,args,timeout=15000)=>new Promise((resolve,reject)=>execFile(exe,args,{windowsHide:true,timeout,maxBuffer:8*1024*1024,encoding:'utf8'},(e,out)=>e?reject(new Error(e.killed?'Operation timed out.':'The command failed. Check the gateway setup and try again.')):resolve(out)));
const claw=(args,timeout)=>run('wsl.exe',clawArgs(state?.connection?.distro||'Ubuntu-24.04',args),timeout);
const parse=(s)=>{let start=s.indexOf('{');if(start<0)throw Error('Gateway returned no JSON response');return JSON.parse(s.slice(start));};
function persist(){const file=path.join(app.getPath('userData'),'state.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2));fs.renameSync(file+'.tmp',file);}
function log(text){state.activity.unshift({text,time:Date.now()});state.activity=state.activity.slice(0,80);persist();}
function load(){try{state=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'state.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Your saved workspace could not be read. It has not been replaced. Restore a backup or contact support.');state={version:1,tasks:[],notes:'',mode:'Focus',timer:null,chat:[],folders:[],activity:[],closeToTray:false};}if(!state.session)state.session='agent:main:command-center-'+crypto.randomUUID();let installerChoice;try{if(app.isPackaged)installerChoice=JSON.parse(fs.readFileSync(path.join(process.resourcesPath,'installer-role.json'),'utf8'));}catch{}state.setup=setup.fromInstaller(state.setup,installerChoice);agentFiles.ensure(agentRoot());persist();}

function createWindow(){win=new BrowserWindow({width:1440,height:960,minWidth:760,minHeight:600,backgroundColor:'#141414',title:brand.productName,icon:path.join(__dirname,'assets/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.setMenuBarVisibility(false);win.loadFile(path.join(__dirname,'index.html'));win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.on('close',e=>{if(!quitting&&state.closeToTray){e.preventDefault();win.hide();}});win.on('closed',()=>{win=null;if(!state.closeToTray)app.quit();});}
function openWorkspace(){quitting=false;if(!win||win.isDestroyed())createWindow();if(win.isMinimized())win.restore();win.show();win.focus();}
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',openWorkspace);
app.whenReady().then(()=>{try{load();}catch(error){dialog.showErrorBox('Could not open your workspace',error.message);app.quit();return;}createWindow();tray=new Tray(path.join(__dirname,'assets/icon.png'));tray.setToolTip(brand.productName);tray.setContextMenu(Menu.buildFromTemplate([{label:'Open '+brand.productName,click:openWorkspace},{type:'separator'},{label:'Quit '+brand.productName,click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',openWorkspace);if(process.argv.includes('--smoke-test')){win.webContents.once('did-finish-load',async()=>{try{await new Promise(r=>setTimeout(r,2500));const result=await win.webContents.executeJavaScript(`(async()=>{const original=await desktop.invoke('state');const tasks=[...original.tasks,{id:'smoke',text:'Persistence verification',done:false}];await desktop.invoke('save',{tasks});const saved=await desktop.invoke('state');if(!saved.tasks.some(t=>t.id==='smoke'))throw Error('Persistence failed');await desktop.invoke('save',{tasks:original.tasks});const m=await desktop.invoke('metrics');if(!(m.memoryTotal>0))throw Error('Metrics failed');for(const name of ['Sparky','Tasks','Devices','Files','System','Settings','Home']){document.querySelector('[data-page="'+name+'"]').click();if(!document.querySelector('#content').textContent.trim())throw Error('Empty page '+name);}return {persistence:true,navigation:true,cpu:m.cpuName,gpu:m.gpu?.name,gateway:await desktop.invoke('gateway')};})()`);fs.writeFileSync(path.join(__dirname,'smoke-result.json'),JSON.stringify(result,null,2));await new Promise(r=>setTimeout(r,1000));fs.writeFileSync(path.join(__dirname,'preview.png'),(await win.webContents.capturePage()).toPNG());}catch(e){fs.writeFileSync(path.join(__dirname,'smoke-result.json'),JSON.stringify({error:e.message}));}finally{quitting=true;app.quit();}});}});
}
app.on('before-quit',()=>quitting=true);
const workspace=require('./workspace-main')({getState:()=>state,persist,isBusy:()=>busy,run});
ipcMain.handle('state',()=>({...state,appVersion:app.getVersion(),startup:app.getLoginItemSettings().openAtLogin,busy}));
ipcMain.handle('setup-save',(_,patch)=>{state.setup=setup.update(state.setup,patch);persist();return state.setup;});
ipcMain.handle('setup-check',(_,distro)=>distro==null?setup.inspect():setup.inspectWslHost(distro));
ipcMain.handle('setup-help',()=>({links:setup.links,steps:setup.steps,guide:fs.readFileSync(path.join(__dirname,'docs','fresh-pc-setup.md'),'utf8')}));
ipcMain.handle('setup-open-guide',(_,name)=>{if(!Object.hasOwn(setup.links,name))throw Error('Unknown setup guide.');return shell.openExternal(setup.links[name]);});
ipcMain.handle('save',(_,patch)=>{if(typeof patch.notes==='string')state.notes=patch.notes.slice(0,50000);if(typeof patch.closeToTray==='boolean')state.closeToTray=patch.closeToTray;if(patch.timer===null||Number.isFinite(patch.timer))state.timer=patch.timer;if(Array.isArray(patch.tasks))state.tasks=patch.tasks.slice(0,500).map(t=>({id:String(t.id),text:String(t.text).slice(0,500),done:!!t.done}));persist();return state;});
ipcMain.handle('startup',(_,enabled)=>{app.setLoginItemSettings({openAtLogin:!!enabled,path:process.execPath});return app.getLoginItemSettings().openAtLogin;});
ipcMain.handle('folder',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});if(!r.canceled){state.folders=[...new Set([...state.folders,r.filePaths[0]])].slice(-12);persist();}return state;});
ipcMain.handle('open-folder',(_,p)=>{if(!state.folders.includes(p))throw Error('Folder not selected');return shell.openPath(p);});
ipcMain.handle('export',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'command-center-backup.json',filters:[{name:'JSON',extensions:['json']}]});if(!r.canceled)fs.writeFileSync(r.filePath,JSON.stringify(state,null,2));return !r.canceled;});
// One place decides where chat goes: the OpenClaw agent, Ollama directly (both on this PC), or a hosted provider.
const route=cfg=>({agent:cfg.active==='openclaw',onDevice:cfg.active==='openclaw'||cfg.active==='local',model:cfg.models[cfg.active]||cfg.models.local||llm.getProvider('local').defaultModel});
ipcMain.handle('gateway',async()=>{const cfg=providerStore.load(providersFile()),to=route(cfg);const probe=to.onDevice?await localSetup.status(to.model,{agent:to.agent}):await llm.probeProvider({providerId:cfg.active,apiKey:cfg.keys[cfg.active],model:cfg.models[cfg.active]});return{ok:probe.ok===true&&(to.onDevice||hostedVerified),discord:'unused',checked:Date.now(),provider:cfg.active,model:cfg.models[cfg.active]||llm.getProvider(cfg.active)?.defaultModel,error:probe.error};});
ipcMain.handle('providers-get',()=>providerStore.snapshot(providersFile(),llm));
ipcMain.handle('providers-save',(_,patch)=>{if(busy||localSetup.get().get().busy)throw Error('Wait for the current reply or local setup to finish.');hostedVerified=false;localSetup.invalidate();providerStore.save(providersFile(),patch||{});return providerStore.snapshot(providersFile(),llm);});
ipcMain.handle('providers-test',async()=>{const cfg=providerStore.load(providersFile()),to=route(cfg);if(to.onDevice){const result=await localSetup.verify(to.model,{agent:to.agent});return {ok:result.verified,providerId:to.agent?'openclaw':'local',model:to.model,error:result.error,reply:result.reply};}const result=await llm.probeProvider({providerId:cfg.active,apiKey:cfg.keys[cfg.active],model:cfg.models[cfg.active]});return {...result,reachable:result.ok,ok:result.ok&&hostedVerified,error:result.ok&&!hostedVerified?'Account access checked. Send a message to verify the selected model.':result.error};});
ipcMain.handle('local-license',()=>shell.openExternal('https://ollama.com/library/llama3.2'));
let previous=os.cpus();
ipcMain.handle('metrics',async()=>{const cpus=os.cpus();let idle=0,total=0;cpus.forEach((c,i)=>{const p=previous[i]||c;idle+=c.times.idle-p.times.idle;for(const k in c.times)total+=c.times[k]-p.times[k];});previous=cpus;let gpu=null;try{const out=await run('nvidia-smi.exe',['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total','--format=csv,noheader,nounits'],3000);const [name,usage,temp,used,size]=out.trim().split(',').map(x=>x.trim());gpu={name,usage:Number(usage),temp:Number(temp),used:Number(used),size:Number(size)};}catch{}let disk=null;try{const s=fs.statfsSync('C:\\');disk={total:s.blocks*s.bsize,free:s.bavail*s.bsize};}catch{}return{cpu:total?Math.round(100*(1-idle/total)):0,cpuName:cpus[0].model,memory:os.totalmem()-os.freemem(),memoryTotal:os.totalmem(),uptime:os.uptime(),gpu,disk,checked:Date.now()};});
ipcMain.handle('events',async()=>{try{return JSON.parse(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-WinEvent -FilterHashtable @{LogName='System';Id=41,1074,6008;StartTime=(Get-Date).AddDays(-7)} -ErrorAction SilentlyContinue | Select-Object -First 10 @{N='time';E={$_.TimeCreated.ToString('s')}},Id,Message) | ConvertTo-Json -Compress" ]));}catch{return[];}});
ipcMain.handle('chat',async(_,message)=>{if(localSetup.get().get().busy)throw Error('Wait for local model setup to finish before sending a message.');if(busy)throw Error('Your agent is still responding');if(typeof message!=='string'||!message.trim()||message.length>12000)throw Error('Enter a message under 12,000 characters');busy=true;try{state.chat.push({role:'user',text:message,time:Date.now()});persist();const cfg=providerStore.load(providersFile());
// OpenClaw keeps the conversation (session), memory and skills itself; only the new message is sent.
if(route(cfg).agent){const reply=await localSetup.openclaw().chat({message,session:state.session});state.chat.push({role:'assistant',text:reply.content,time:Date.now(),model:reply.model,provider:'openclaw'});log('Your assistant replied through OpenClaw'+(reply.model?' ('+reply.model+')':'')+'.');return state;}
const history=state.chat.filter(m=>m.role==='user'||m.role==='assistant').slice(-24).map(m=>({role:m.role,content:m.text}));const result=await llm.completeChat({providerId:cfg.active,model:cfg.models[cfg.active]||undefined,apiKey:cfg.keys[cfg.active],maxTokens:2048,messages:cfg.active==='local'?require('./local-chat.cjs').messages(history):[{role:'system',content:agentFiles.systemPrompt(agentRoot())},...history]});if(!result.content)throw Error('Your agent returned no text. Check your model settings and try again.');if(cfg.active!=='local')hostedVerified=true;const absorbed=cfg.active==='local'?{visible:result.content}:agentFiles.absorbReply(agentRoot(),result.content,{summary:(message.slice(0,120)+' → '+result.content.slice(0,200))});state.chat.push({role:'assistant',text:absorbed.visible,time:Date.now(),model:result.model,provider:result.providerId});log('Sparky replied with '+((result.providerId||cfg.active)+' / '+(result.model||'model'))+'.');return state;}catch(e){state.chat.push({role:'error',text:'Reply could not be confirmed. '+e.message,time:Date.now()});persist();throw e;}finally{busy=false;}});



