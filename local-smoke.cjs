const {app,BrowserWindow,ipcMain,net}=require('electron'),fs=require('fs'),path=require('path');
const profile=path.join(__dirname,'.qa','local-test-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
net.fetch=async()=>{throw Error('Offline update fixture');};
let running=false,installed=false,attempts=0,verified=0,installs=0;
require('./local-model.cjs').createLocalApi=()=>({
 reachable:async()=>running,installed:async()=>installed,
 pull:async(model,progress)=>{attempts++;progress({message:'Downloading model layer',total:100,completed:50});await new Promise(r=>setTimeout(r,1500));if(attempts===1)throw Error('Test download interrupted');installed=true;},
 verify:async model=>{verified++;return {ok:true,model,reply:'hello from '+model};}
});
require('./local-runtime.cjs').createWindowsRuntime=()=>({find:async()=>running?'ollama.exe':null,install:async()=>{installs++;},start:async()=>{running=true;}});
// OpenClaw stand-in: the real module would download and run OpenClaw's installer on this PC.
let clawInstalled=false,clawConfigured=false;const clawCalls=[];
require('./openclaw-native.cjs').createOpenClaw=()=>({
 locate:async()=>clawInstalled?{}:null,install:async()=>{clawCalls.push('install');clawInstalled=true;},configured:()=>clawConfigured,
 onboard:async({model})=>{clawCalls.push('onboard:'+model);clawConfigured=true;return {reused:false};},setName:async name=>clawCalls.push('name:'+name),
 startGateway:async()=>clawCalls.push('gateway'),gatewayRunning:async()=>true,agents:async()=>[{id:'main',name:'Pip'}],
 chat:async({session})=>{clawCalls.push('chat:'+session);return {content:session.includes('setup-check')?'The answer is 12.':'Hello from OpenClaw',model:'llama3.2:3b',provider:'ollama'};},
 doctor:async()=>({ok:true,checksRun:3,checksSkipped:0,findings:[]}),repair:async()=>({ok:true}),log:()=>[]});
require('./main');
for(const name of ['metrics','setup-check'])ipcMain.removeHandler(name);
ipcMain.handle('metrics',()=>({memoryTotal:8*1024**3}));ipcMain.handle('setup-check',()=>({wsl:{distributions:[]}}));
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 try{
  await new Promise(r=>setTimeout(r,300));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const $=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m)};
   $('[data-role=host]').click();await wait(100);check($('#local-model'),'Local model first');check(!$('#distro'),'No Ubuntu prerequisite gate');
   $('#local-model').value='llama3.2:3b';$('#local-model').dispatchEvent(new Event('change',{bubbles:true}));
   $('[data-action=prepare-local]').click();for(let n=0;n<20&&$('progress')?.value!==50;n++)await wait(50);check($('progress')?.value===50,'Real download progress');check($('[data-action=prepare-local]').disabled,'Duplicate setup blocked');await wait(1700);
   check($('#content').textContent.includes('Test download interrupted'),'Failure stays visible');
   $('[data-page=devices]').click();check($('#content').textContent.includes('Test download interrupted'),'This PC retains failure');
   $('#content [data-page=setup]').click();check($('#local-model').value==='llama3.2:3b','Model survives navigation');
   $('#local-agent-name').value='Pip';
   $('[data-action=prepare-local]').click();for(let n=0;n<60&&!$('#content').textContent.includes('Your assistant is ready');n++)await wait(50);check($('#content').textContent.includes('Your assistant is ready'),'Reply verified');check($('#content').textContent.includes('The answer is 12.'),'First reply through OpenClaw shown');
   check($('#content').textContent.includes('runs on OpenClaw'),'Ready message names the backbone');
   const cfg=await desktop.invoke('providers-get');check(cfg.active==='openclaw'&&cfg.model==='llama3.2:3b','Chat goes through OpenClaw with the verified model');
   check((await desktop.invoke('gateway')).ok,'Readiness matches verified model');
   $('[data-action=openclaw-doctor]').click();for(let n=0;n<20&&!$('#openclaw-doctor');n++)await wait(50);check($('#openclaw-doctor')?.textContent.includes('found nothing to fix'),'OpenClaw doctor report shown');
   const state=await desktop.invoke('chat','hello');check(state.chat.at(-1).text==='Hello from OpenClaw'&&state.chat.at(-1).provider==='openclaw','Chat replies come from OpenClaw');
   check(state.connection?.agentName==='Pip','Assistant name carried into the workspace');
   return {localFirst:true,realProgress:true,preservedError:true,resumeNavigation:true,modelSelection:true,verifiedReply:true,openclawBackbone:true};
  })()`);
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'local-setup.json'),'utf8'));if(saved.phase!=='ready'||saved.model!=='llama3.2:3b')throw Error('Setup not persisted');
  if(installs!==1||attempts!==2||verified!==1)throw Error('Unexpected install/download/verification counts');
  if(clawCalls.slice(0,5).join('|')!=='install|onboard:llama3.2:3b|name:Pip|gateway|chat:agent:main:foxsocket-setup-check')throw Error('Unexpected OpenClaw steps: '+clawCalls.join('|'));
  for(const size of [[1440,920],[760,600]]){win.setContentSize(...size);await new Promise(r=>setTimeout(r,100));if(await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth'))throw Error('Horizontal overflow');fs.writeFileSync(path.join(__dirname,'.qa','local-'+size[0]+'.png'),(await win.webContents.capturePage()).toPNG());}
  fs.writeFileSync(path.join(__dirname,'.qa','local-results.json'),JSON.stringify({...result,persistence:true,viewports:true}));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(__dirname,'.qa','local-results.json'),JSON.stringify({error:error.stack}));app.exit(1);}
});
