'use strict';
// Runs the local model with llama.cpp: PrismML's build, which also runs the
// ternary Bonsai models. Rennie downloads a pinned build and model, checks
// both against published SHA-256 hashes, and starts llama-server on loopback
// with a per-install API key. Measurements behind every choice here:
// docs/engine-plan.md.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {download}=require('./download.cjs');
const execute=promisify(execFile);
const GB=1024**3;
const RELEASE='prism-b10743-adfffbe';
const RELEASE_URL=`https://github.com/PrismML-Eng/llama.cpp/releases/download/${RELEASE}/`;
// Digests as published on the GitHub release. The CUDA build needs its runtime DLLs from a second archive.
const BUILDS=Object.freeze({
 // unpackedBytes: measured size of the unpacked build, for the free-space check.
 cuda:{label:'NVIDIA GPU (CUDA 12.4)',unpackedBytes:1176304640,archives:[
  {file:`llama-${RELEASE}-bin-win-cuda-12.4-x64.zip`,bytes:257322810,sha256:'1b849f713bee42fda258de83770cd422e8f48dd631ce370eb0641f6458c69d87'},
  {file:'cudart-llama-bin-win-cuda-12.4-x64.zip',bytes:391443627,sha256:'8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'}]},
 cpu:{label:'Processor only',unpackedBytes:50246496,archives:[
  {file:`llama-${RELEASE}-bin-win-cpu-x64.zip`,bytes:19441568,sha256:'d0b3016c9cc4bc1385de68be034adee570277ba952dd94292ba3888b7f18cc44'}]},
});
// Hugging Face files pinned to a repository revision. `build` preserves the
// legacy backend on quiet reopen; explicit setup resolves hardware separately.
// AMD and Intel GPUs use the processor tier
// until they are tested (PrismML lists open Vulkan problems for Bonsai files). Each cutoff leaves room above the
// measured 32K-context footprint (Bonsai 2: 9.1 GB; Qwen3.5 9B: 6,191 MiB, more than a 6 GB card's 6,144 MiB).
const MODELS=Object.freeze([
 {id:'bonsai-2-27b',label:'Ternary Bonsai 2 27B',build:'cuda',minVideoMemory:11.5*GB,repo:'prism-ml/Ternary-Bonsai-2-27B-gguf',revision:'b072e1d3b35a0a630cece372c2127528e0994386',file:'Ternary-Bonsai-2-27B-PQ2_0.gguf',bytes:7206168928,sha256:'3907dc1658db1f78a9826bf8d5bcb8dc65db0d466388937af57f2294fae62ec1',reasoning:'medium',
  download:'About 7.2 GB',memory:'For NVIDIA GPUs with 12 GB or more of video memory. Best quality and fastest thinking in our tests.'},
 {id:'qwen3.5-9b',label:'Qwen3.5 9B',build:'cuda',minVideoMemory:7.5*GB,repo:'unsloth/Qwen3.5-9B-GGUF',revision:'3885219b6810b007914f3a7950a8d1b469d598a5',file:'Qwen3.5-9B-Q4_K_M.gguf',bytes:5680522464,sha256:'03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
  download:'About 5.7 GB',memory:'For NVIDIA GPUs with 8 GB or more of video memory.'},
 {id:'qwen3.5-4b',label:'Qwen3.5 4B',build:'cpu',minVideoMemory:0,repo:'unsloth/Qwen3.5-4B-GGUF',revision:'e87f176479d0855a907a41277aca2f8ee7a09523',file:'Qwen3.5-4B-Q4_K_M.gguf',bytes:2740937888,sha256:'00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
  download:'About 2.7 GB',memory:'A smaller model for responsive local chat. Uses a compatible NVIDIA GPU when it fits; otherwise uses the processor with sufficient memory.'},
]);
const TASK='Rennie model server';
const modelUrl=model=>`https://huggingface.co/${model.repo}/resolve/${model.revision}/${model.file}`;
// NVIDIA's minimum driver for CUDA 12.4 on Windows.
const CUDA_DRIVER=[551,78];
// 8 GB PCs usually report about 7.7 GB.
const SMALL_MEMORY=7.5*GB;
const DOWNLOAD_REASONS={
 stalled:what=>`The ${what} download stopped receiving data and did not recover after several automatic retries. Check the internet connection, then choose Resume setup; the download continues where it stopped.`,
 network:what=>`The connection dropped during the ${what} download and did not recover after several automatic retries. Choose Resume setup when you are back online; the download continues where it stopped.`,
 server:what=>`The ${what} download server is busy or unavailable. Wait a few minutes, then choose Resume setup.`,
 http:what=>`The ${what} download link was refused by the server. Update Rennie or try again later.`,
 size:what=>`The ${what} download was larger than expected, so it was not used. Update Rennie or try again later.`,
 incomplete:what=>`The ${what} download ended early. Choose Resume setup; the download continues where it stopped.`,
 restart:what=>`The saved ${what} download no longer matched the server and was discarded. Choose Resume setup to download it again.`,
};

// The GPU with the most video memory decides. No NVIDIA driver means no GPU tier.
async function detect({executeImpl=execute,totalMemory=os.totalmem()}={}){
  let gpu=null;
  try{
    const {stdout}=await executeImpl('nvidia-smi.exe',['--query-gpu=name,memory.total,driver_version','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000});
    for(const line of stdout.trim().split(/\r?\n/)){const [name,mib,driver]=line.split(',').map(part=>part.trim());const videoMemory=Number(mib)*1024**2;if(name&&videoMemory>0&&(!gpu||videoMemory>gpu.videoMemory))gpu={name,videoMemory,driver};}
  }catch{}
  return {gpu,totalMemory};
}
const driverAtLeast=(version,[major,minor])=>{const [a,b=0]=String(version||'').split('.').map(Number);return a>major||(a===major&&b>=minor);};
function executionPlan(model,{gpu,totalMemory}){
  // 4B's CUDA cutoff is conservative pending measurements on 4–6 GB cards.
  // Model weights alone do not include the 32K context and runtime overhead.
  const videoRequired=model.id==='qwen3.5-4b'?5.5*GB:model.minVideoMemory;
  const supported=model.id==='qwen3.5-4b'||model.build==='cuda';
  const cuda=!!gpu&&driverAtLeast(gpu.driver,CUDA_DRIVER);
  const build=supported&&cuda&&gpu.videoMemory>=videoRequired?'cuda':'cpu';
  const ramRequired=model.id==='bonsai-2-27b'?16*GB:model.id==='qwen3.5-9b'?12*GB:SMALL_MEMORY;
  const fits=build==='cuda'||Number.isFinite(totalMemory)&&totalMemory>=ramRequired;
  const reason=build==='cuda'?`Using ${gpu.name} for ${model.label}`:
    gpu&&!cuda?`Using the processor: ${gpu.name} needs NVIDIA driver ${CUDA_DRIVER.join('.')} or newer`:
    supported&&cuda?`Using the processor: this model needs at least ${(videoRequired/GB).toFixed(1)} GB of video memory with the current context`:
    'Using the processor: no compatible NVIDIA GPU was detected; AMD and Intel acceleration is not supported yet';
  return {model:model.id,build,fits,reason,...(!fits?{problem:`${model.label} needs at least ${Math.ceil(ramRequired/GB)} GB of system memory on the processor. Choose a smaller model or use a compatible GPU.`}:{})};
}
function choose(hardware,models=MODELS){
  // Favor the small responsive default; larger models remain explicit choices.
  const model=models.find(m=>m.id==='qwen3.5-4b')||models.at(-1);
  return {...executionPlan(model,hardware),lowMemory:Number.isFinite(hardware.totalMemory)&&hardware.totalMemory<SMALL_MEMORY};
}
function sha256(file){return new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256');fs.createReadStream(file).on('error',reject).on('data',chunk=>hash.update(chunk)).on('end',()=>resolve(hash.digest('hex')));});}

function createLlamaRuntime({directory,fetchImpl=fetch,env=process.env,executeImpl=execute,spawnImpl=spawn,platformName=process.platform,port=18080,taskName=TASK,scheduleEnabled=true,detectImpl=()=>detect({executeImpl}),stallMs=60000,wait,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),startTimeoutMs=300000,builds=BUILDS,models=MODELS,releaseUrl=RELEASE_URL,urlFor=modelUrl}){
  const selections=new Map();
  const get=id=>{const model=models.find(m=>m.id===id);if(!model)throw Error('Choose one of the listed local models.');return {...model,...selections.get(id)};};
  const plan=async id=>{get(id);return executionPlan(models.find(m=>m.id===id),await detectImpl());};
  async function configure(id,{build}={}){const selected=build?{model:id,build}:await plan(id);if(!build&&!selected.fits)throw Error(selected.problem);if(!builds[selected.build])throw Error('Unsupported local engine.');get(id);selections.set(id,selected);return selected;}
  const buildDir=build=>path.join(directory,'llama',RELEASE+'-'+build);
  const server=build=>path.join(buildDir(build),'llama-server.exe');
  const modelFile=model=>path.join(directory,'models',model.file);
  const keyFile=path.join(directory,'server-key.txt');
  const base=`http://127.0.0.1:${port}`;
  // Hashing a 7 GB model takes a while, so a verified model records its size
  // and time; a later check trusts that record while both still match.
  const marker=model=>modelFile(model)+'.verified';
  const verified=model=>{try{const s=fs.statSync(modelFile(model)),m=JSON.parse(fs.readFileSync(marker(model),'utf8'));return m.sha256===model.sha256&&m.size===s.size&&m.mtimeMs===s.mtimeMs;}catch{return false;}};
  function needs(id,selected){
    const model={...get(id),...selected},needsBuild=!fs.existsSync(server(model.build)),needsModel=!verified(model);
    const buildBytes=builds[model.build].archives.reduce((sum,a)=>sum+a.bytes,0);
    return {needsBuild,needsModel,downloadBytes:(needsBuild?buildBytes:0)+(needsModel?model.bytes:0),modelBytes:model.bytes,buildBytes,unpackedBytes:builds[model.build].unpackedBytes||0};
  }
  // Downloads unless a complete copy is already there, then checks the hash. A mismatch is deleted, never used.
  async function fetchVerified({url,target,bytes,sha256:expected,what,phase},progress){
    let present=false;try{present=fs.statSync(target).size===bytes;}catch{}
    if(!present){
      try{await download({url,target,fetchImpl,stallMs,wait,maxBytes:bytes,onProgress:p=>progress({phase,message:p.retrying?'The connection paused. Retrying and continuing where the download stopped.':`Downloading ${what}.`,total:p.total||bytes,completed:p.completed})});}
      catch(error){throw Error((DOWNLOAD_REASONS[error.reason]||(w=>`The ${w} could not download. Check the connection and retry.`))(what));}
    }
    progress({phase,message:`Checking the ${what} download.`,total:null,completed:0});
    if(await sha256(target)!==expected){fs.rmSync(target,{force:true});throw Error(`The ${what} download did not match its published checksum, so it was deleted. Choose Resume setup to download it again.`);}
  }
  async function install(id,progress=()=>{}){
    if(platformName!=='win32')throw Error('Local model setup is available on Windows.');
    const model=get(id);
    if(!fs.existsSync(server(model.build))){
      const downloads=path.join(directory,'downloads'),staging=buildDir(model.build)+'.partial';
      fs.mkdirSync(downloads,{recursive:true});fs.rmSync(staging,{recursive:true,force:true});fs.mkdirSync(staging,{recursive:true});
      for(const archive of builds[model.build].archives){
        const target=path.join(downloads,archive.file);
        await fetchVerified({url:releaseUrl+archive.file,target,bytes:archive.bytes,sha256:archive.sha256,what:'llama.cpp engine',phase:'downloading-engine'},progress);
        progress({phase:'unpacking-engine',message:'Unpacking the llama.cpp engine.',total:null,completed:0});
        // Windows' own tar.exe reads zip archives; nothing else is installed.
        try{await executeImpl(path.join(env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',target,'-C',staging],{windowsHide:true,timeout:600000});}
        catch{throw Error('The llama.cpp engine could not be unpacked. Check that the drive has free space, then choose Resume setup.');}
      }
      if(!fs.existsSync(path.join(staging,'llama-server.exe')))throw Error('The llama.cpp engine download did not contain its server. Update Rennie.');
      fs.rmSync(buildDir(model.build),{recursive:true,force:true});fs.renameSync(staging,buildDir(model.build));
      for(const archive of builds[model.build].archives)fs.rmSync(path.join(downloads,archive.file),{force:true});
    }
    if(!verified(model)){
      fs.mkdirSync(path.dirname(modelFile(model)),{recursive:true});
      await fetchVerified({url:urlFor(model),target:modelFile(model),bytes:model.bytes,sha256:model.sha256,what:model.label+' model',phase:'downloading-model'},progress);
      const s=fs.statSync(modelFile(model));fs.writeFileSync(marker(model),JSON.stringify({sha256:model.sha256,size:s.size,mtimeMs:s.mtimeMs}));
    }
  }
  // A 256-bit key, created once per install. The server reads it from this file, so it never appears in a process list.
  // Reading never creates a key: only starting the server does, so checks and chat leave nothing behind.
  const savedKey=()=>{try{const saved=fs.readFileSync(keyFile,'utf8').trim();return /^[0-9a-f]{64}$/.test(saved)?saved:null;}catch{return null;}};
  function key(){
    const saved=savedKey();if(saved)return saved;
    const created=crypto.randomBytes(32).toString('hex');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(keyFile,created+'\n',{mode:0o600});return created;
  }
  function args(id){
    const model=get(id);
    return ['-m',modelFile(model),'--alias',model.id,'--host','127.0.0.1','--port',String(port),'-c','32768','--jinja','-fa','on','-np','1','--reasoning-format','deepseek','--api-key-file',keyFile,'--no-webui','--log-file',path.join(directory,'llama-server.log'),...(model.build==='cuda'?['-ngl','99']:[])];
  }
  async function request(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{return await fetchImpl(url,{...options,signal:controller.signal});}catch{return null;}finally{clearTimeout(timer);}}
  // "ours" only when the server accepts this install's key and serves the chosen model.
  async function status(id){
    const model=get(id),health=await request(base+'/health');
    if(!health)return 'down';
    if(health.status===503)return 'loading';
    // Without a key of our own, whatever answers on the port cannot be our server.
    const saved=savedKey();if(!saved)return 'foreign';
    const listed=await request(base+'/v1/models',{headers:{authorization:'Bearer '+saved}});
    if(!listed||!listed.ok)return 'foreign';
    try{const body=await listed.json();return (body.data||[]).some(entry=>entry.id===model.id)?'ours':'other-model';}catch{return 'foreign';}
  }
  // Values reach PowerShell only through environment variables, never as code.
  const powershell=(script,values,timeout=60000)=>executeImpl(path.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout,env:{...env,...values}});
  // One Windows command-line argument (CommandLineToArgvW rules).
  const quote=arg=>/[\s"]/.test(arg)?'"'+arg.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"':arg;
  // A per-user task starts the server when this user signs in to Windows. conhost --headless runs it with no window.
  // No automatic restart: a server Rennie stops on purpose must stay stopped, and Rennie starts it again when opened.
  async function schedule(id){
    if(!scheduleEnabled)return false;
    const model=get(id);
    const script="$ErrorActionPreference='Stop';$u=[Security.Principal.WindowsIdentity]::GetCurrent().Name;"+
      "$a=New-ScheduledTaskAction -Execute $env:RENNIE_EXE -Argument $env:RENNIE_ARGS -WorkingDirectory $env:RENNIE_DIR;"+
      "$t=New-ScheduledTaskTrigger -AtLogOn -User $u;"+
      "$s=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew;"+
      "$p=New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited;"+
      "Register-ScheduledTask -TaskName $env:RENNIE_TASK -Description 'Starts the Rennie local model server (llama.cpp) on this PC only.' -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null";
    try{await powershell(script,{RENNIE_TASK:taskName,RENNIE_EXE:path.join(env.SystemRoot||'C:\\Windows','System32','conhost.exe'),RENNIE_ARGS:['--headless',server(model.build),...args(id)].map(quote).join(' '),RENNIE_DIR:buildDir(model.build)});}
    catch{throw Error('Rennie could not set the local model to start when you sign in. It still starts whenever Rennie opens.');}
  }
  const scheduled=async()=>{try{await executeImpl('schtasks.exe',['/Query','/TN',taskName],{windowsHide:true,timeout:15000});return true;}catch{return false;}};
  async function unschedule(){if(!await scheduled())return false;await powershell('Unregister-ScheduledTask -TaskName $env:RENNIE_TASK -Confirm:$false',{RENNIE_TASK:taskName});return true;}
  // Every llama-server.exe running from this runtime's own folder; never any other copy on the PC.
  async function ours(stop=false){
    const script="$d=[IO.Path]::GetFullPath($env:RENNIE_LLAMA_DIR).TrimEnd('\\')+'\\';$p=@(Get-CimInstance Win32_Process -Filter \"Name='llama-server.exe'\"|Where-Object{$_.ExecutablePath -and $_.ExecutablePath.StartsWith($d,[StringComparison]::OrdinalIgnoreCase)});"+
      (stop?"foreach($x in $p){Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue};foreach($x in $p){Wait-Process -Id $x.ProcessId -Timeout 15 -ErrorAction SilentlyContinue};":'')+"$p.Count";
    try{const {stdout}=await powershell(script,{RENNIE_LLAMA_DIR:path.join(directory,'llama')},40000);return Number(String(stdout).trim())||0;}catch{return 0;}
  }
  async function start(id,{allowBackendSwitch=true}={}){
    const model=get(id),current=await status(id);
    if(current==='ours'&&!selections.has(id))return {started:false};
    if(current==='ours'){
      const {stdout}=await powershell("@(Get-CimInstance Win32_Process -Filter \"Name='llama-server.exe'\"|Where-Object{$_.ExecutablePath -eq $env:RENNIE_EXPECTED_EXE}).Count",{RENNIE_EXPECTED_EXE:server(model.build)});
      if(Number(String(stdout).trim())===1)return {started:false};
      if(!allowBackendSwitch)throw Error('This model is running on a different engine. Choose Resume setup to switch; the running model was kept.');
    }
    if(current==='foreign')throw Error(`Another program is using port ${port} on this PC, so the local model server cannot start. Close that program, then retry.`);
    if(!fs.existsSync(server(model.build))||!verified(model))throw Error('The local model is not set up yet. Choose Set up my assistant.');
    if(current==='ours'||current==='other-model'||current==='loading')await stop();
    key();
    let failed=null,viaTask=false;
    if(await scheduled()){
      // The task always runs the chosen model, so it is refreshed before it runs.
      await schedule(id);
      try{await executeImpl('schtasks.exe',['/Run','/TN',taskName],{windowsHide:true,timeout:15000});viaTask=true;}catch{}
    }
    if(!viaTask){
      const child=spawnImpl(server(model.build),args(id),{cwd:buildDir(model.build),detached:true,windowsHide:true,stdio:'ignore'});
      child.on('error',error=>failed=failed||error);child.on('exit',code=>failed=failed||Error('exit '+code));child.unref();
    }
    const began=Date.now();
    for(let check=0;Date.now()-began<startTimeoutMs;check++,await sleep(1000)){
      // A task-started server has no process handle here, so its exit is noticed by looking for it.
      if(!failed&&viaTask&&check>0&&check%10===0&&!await ours())failed=Error('not running');
      if(failed)throw Error('The local model server stopped while starting. Details are in llama-server.log in the Rennie engine folder. Retry setup; if it keeps stopping, restart Windows.');
      if(await status(id)==='ours')return {started:true};
    }
    // Never leave a half-started server behind: it would hold the port and memory.
    await stop();
    throw Error('The local model server did not become ready. Retry setup or restart Windows.');
  }
  // Stops only llama-server copies running from this runtime's folder, and waits until they have exited so the port is free.
  async function stop(){
    if(await scheduled())await executeImpl('schtasks.exe',['/End','/TN',taskName],{windowsHide:true,timeout:15000}).catch(()=>null);
    const stopped=await ours(true)>0;
    // Wait-Process can return while Windows is still ending the process; the next server needs the port.
    for(let attempt=0;stopped&&attempt<20&&await ours()>0;attempt++)await sleep(500);
    return stopped;
  }
  // The same two checks as the Ollama path, sent straight to the server with thinking off.
  const LOCAL_CHAT=()=>require('./local-chat.cjs');
  async function complete(id,messages,{maxTokens=1024,temperature=0.4,timeoutMs=300000,deterministic=false}={}){
    const model=get(id),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(base+'/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json',authorization:'Bearer '+(savedKey()||(()=>{throw Error('The local model is not set up yet. Choose Set up my assistant.');})())},
        body:JSON.stringify({model:model.id,messages,max_tokens:maxTokens,temperature,...(deterministic?{seed:42}:{}),reasoning_effort:'none',chat_template_kwargs:{enable_thinking:false,reasoning_effort:'none'}})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(response.status===401?'The local model server rejected this install’s key. Choose Resume setup.':String(body?.error?.message||'The local model server returned HTTP '+response.status+'.').slice(0,300));
      const content=String(body.choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
      if(!content)throw Error(model.label+' returned an empty reply.');
      return {content,model:String(body.model||model.id),providerId:'local'};
    }catch(error){throw error.name==='AbortError'?Error('The local model did not reply in time.'):error;}
    finally{clearTimeout(timer);}
  }
  async function verify(id){
    const model=get(id),checks=[];
    for(const check of LOCAL_CHAT().CHECKS){
      const reply=await complete(id,LOCAL_CHAT().messages([{role:'user',content:check.prompt}]),{maxTokens:256,temperature:0,deterministic:true});
      if(reply.model!==model.id)throw Error('The local model server replied using a different model. Retry setup.');
      if(!check.accept(reply.content))throw Error(`The local model is installed and running, but it answered the basic ${check.id} check incorrectly, so its answers would be unreliable. Retry setup. Reply: `+reply.content.slice(0,180));
      checks.push({id:check.id,reply:reply.content.slice(0,500)});
    }
    return {ok:true,providerId:'local',model:id,reply:checks.map(c=>c.id+': '+c.reply).join(' · '),checks};
  }
  // What setup needs to hand OpenClaw's llama.cpp connector.
  const target=id=>({baseUrl:base+'/v1',modelId:get(id).id,apiKey:key(),thinking:get(id).reasoning||null});
  const running=async id=>await status(id)==='ours';
  return {kind:'llama',models,plan,configure,needs,install,start,status,running,stop,key,args,schedule,scheduled,unschedule,verify,complete,target,paths:{directory,keyFile,server,modelFile:id=>modelFile(get(id))},baseUrl:base+'/v1'};
}
module.exports={createLlamaRuntime,detect,choose,executionPlan,BUILDS,MODELS,RELEASE,TASK,modelUrl,GB};
