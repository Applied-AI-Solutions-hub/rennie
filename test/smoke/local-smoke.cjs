const {app,BrowserWindow,ipcMain,net}=require('electron'),fs=require('fs'),path=require('path');
const profile=path.join(__dirname,'..','..','.qa','local-test-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);process.env.LOCALAPPDATA=path.join(profile,'localappdata');
net.fetch=async()=>{throw Error('Offline update fixture');};
// llama.cpp engine stand-in on a PC with a 12 GB NVIDIA GPU: the real one would download 8 GB and start a server.
let built=false,downloaded=false,running=false,attempts=0,verified=0,installs=0,scheduled=0;const targets=[];
const llama=require('../../src/llama-runtime.cjs');
llama.detect=async()=>({gpu:{name:'NVIDIA GeForce RTX 4070',videoMemory:12288*1024**2,driver:'560.94'},totalMemory:16*1024**3});
llama.createLlamaRuntime=()=>({kind:'llama',models:llama.MODELS,
 // Sizes follow the model asked about, like the real engine, so the screen's estimate can be checked against the choice.
 needs:model=>{const m=llama.MODELS.find(x=>x.id===model),b=llama.BUILDS[m.build],buildBytes=b.archives.reduce((sum,a)=>sum+a.bytes,0);return {needsBuild:!built,needsModel:!downloaded,downloadBytes:(built?0:buildBytes)+(downloaded?0:m.bytes),modelBytes:m.bytes,buildBytes,unpackedBytes:b.unpackedBytes};},
 install:async(model,progress)=>{attempts++;if(!built)installs++;built=true;progress({phase:'downloading-model',message:'Downloading the model.',total:100,completed:50});await new Promise(r=>setTimeout(r,1500));if(attempts===1)throw Error('Test download interrupted');downloaded=true;},
 start:async()=>{running=true;},running:async()=>running,schedule:async()=>{scheduled++;},
 verify:async model=>{verified++;return {ok:true,model,reply:'hello from '+model};},
 target:model=>{const target={baseUrl:'http://127.0.0.1:18080/v1',modelId:model,apiKey:'ab'.repeat(32),thinking:'medium'};targets.push(target);return target;},
 complete:async()=>{throw Error('Chat must go through OpenClaw once it has replied');}});
// OpenClaw stand-in: the real module would download and run OpenClaw's installer on this PC.
let clawInstalled=false,clawConfigured=false;const clawCalls=[];
require('../../src/openclaw-native.cjs').createOpenClaw=()=>({
 locate:async()=>clawInstalled?{}:null,install:async()=>{clawCalls.push('install');clawInstalled=true;},configured:()=>clawConfigured,
 onboard:async({model,target})=>{clawCalls.push('onboard:'+model+'@'+target?.baseUrl);clawConfigured=true;return {reused:false};},setName:async name=>clawCalls.push('name:'+name),
 startGateway:async()=>clawCalls.push('gateway'),gatewayRunning:async()=>true,agents:async()=>[{id:'main',name:'Pip'}],
 chat:async({session})=>{clawCalls.push('chat:'+session);return {content:session.includes('setup-check')?'The answer is 12.':'Hello from OpenClaw',model:'llama-cpp/bonsai-2-27b',provider:'llama-cpp'};},
 doctor:async()=>({ok:true,checksRun:3,checksSkipped:0,findings:[]}),repair:async()=>({ok:true}),log:()=>[]});
require('../../src/main');
for(const name of ['metrics','setup-check'])ipcMain.removeHandler(name);
ipcMain.handle('metrics',()=>({memoryTotal:8*1024**3}));ipcMain.handle('setup-check',()=>({wsl:{distributions:[]}}));
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 try{
  await new Promise(r=>setTimeout(r,300));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const $=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m)};
   $('[data-role=host]').click();await wait(100);check($('#local-model'),'Local model first');check(!$('#distro'),'No Ubuntu prerequisite gate');
   for(let n=0;n<40&&!$('#content').textContent.includes('we recommend Ternary Bonsai 2 27B');n++)await wait(50);check($('#content').textContent.includes('we recommend Ternary Bonsai 2 27B'),'The model is recommended from the GPU');
   check($('#local-model').value==='bonsai-2-27b','The recommended model is preselected');
   for(let n=0;n<40&&!$('#content').textContent.includes('download about 7.5 GB');n++)await wait(50);check($('#content').textContent.includes('download about 7.5 GB'),'The download estimate follows the recommended model (#16), got: '+($('#content').textContent.match(/download about [0-9.]+ GB/)||['none'])[0]);check(!$('#local-custom-model'),'No Ollama model field with llama.cpp');check($('#content').textContent.includes('Download the llama.cpp engine'),'Setup steps name the engine');
   $('[data-action=prepare-local]').click();for(let n=0;n<20&&$('progress')?.value!==50;n++)await wait(50);check($('progress')?.value===50,'Real download progress');check($('[data-action=prepare-local]').disabled,'Duplicate setup blocked');await wait(1700);
   check($('#content').textContent.includes('Test download interrupted'),'Failure stays visible');
   $('[data-page=devices]').click();check($('#content').textContent.includes('Test download interrupted'),'This PC retains failure');
   $('#content [data-page=setup]').click();check($('#local-model').value==='bonsai-2-27b','Model survives navigation');
   $('#local-agent-name').value='Pip';
   $('[data-action=prepare-local]').click();for(let n=0;n<60&&!$('#content').textContent.includes('Your assistant is ready');n++)await wait(50);check($('#content').textContent.includes('Your assistant is ready'),'Reply verified');check($('#content').textContent.includes('The answer is 12.'),'First reply through OpenClaw shown');
   check($('#content').textContent.includes('runs on OpenClaw'),'Ready message names the backbone');
   const cfg=await desktop.invoke('providers-get');check(cfg.active==='openclaw'&&cfg.model==='bonsai-2-27b','Chat goes through OpenClaw with the verified model');
   check((await desktop.invoke('gateway')).ok,'Readiness matches verified model');
   $('[data-action=openclaw-doctor]').click();for(let n=0;n<20&&!$('#openclaw-doctor');n++)await wait(50);check($('#openclaw-doctor')?.textContent.includes('found nothing to fix'),'OpenClaw doctor report shown');
   const state=await desktop.invoke('chat','hello');check(state.chat.at(-1).text==='Hello from OpenClaw'&&state.chat.at(-1).provider==='openclaw','Chat replies come from OpenClaw');
   check(state.connection?.agentName==='Pip','Assistant name carried into the workspace');
   return {localFirst:true,realProgress:true,preservedError:true,resumeNavigation:true,modelSelection:true,verifiedReply:true,openclawBackbone:true};
  })()`);
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'local-setup.json'),'utf8'));if(saved.phase!=='ready'||saved.model!=='bonsai-2-27b'||saved.engine!=='llama')throw Error('Setup not persisted');
  if(installs!==1||attempts!==2||verified!==1||scheduled!==1)throw Error('Unexpected install/download/verification/sign-in task counts');
  if(!targets.length||targets.some(t=>t.modelId!=='bonsai-2-27b'))throw Error('OpenClaw was not pointed at the engine');
  if(clawCalls.slice(0,5).join('|')!=='install|onboard:bonsai-2-27b@http://127.0.0.1:18080/v1|name:Pip|gateway|chat:agent:main:rennie-setup-check')throw Error('Unexpected OpenClaw steps: '+clawCalls.join('|'));
  for(const size of [[1440,920],[760,600]]){win.setContentSize(...size);await new Promise(r=>setTimeout(r,100));if(await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth'))throw Error('Horizontal overflow');fs.writeFileSync(path.join(__dirname,'..','..','.qa','local-'+size[0]+'.png'),(await win.webContents.capturePage()).toPNG());}
  fs.writeFileSync(path.join(__dirname,'..','..','.qa','local-results.json'),JSON.stringify({...result,persistence:true,viewports:true}));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(__dirname,'..','..','.qa','local-results.json'),JSON.stringify({error:error.stack}));app.exit(1);}
});
