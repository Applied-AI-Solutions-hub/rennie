'use strict';
// Runs the Lenovo acceptance steps that a machine can run, against the real installed app, in a
// throwaway Windows VM (GitHub Actions). It drives the app the way the setup screen does: through
// the page's own desktop.invoke(), reached over Chromium's debugging port on this VM only.
//
//   node build/sandbox-acceptance.cjs full <installer>            clean install → setup → chat → privacy →
//                                                                 simulated restart → break and repair →
//                                                                 reinstall → uninstall
//   node build/sandbox-acceptance.cjs upgrade <old> <new>         pre-rename build → this build: the profile
//                                                                 moves, the data survives, Rennie.exe replaces Foxsocket.exe
//
// Not a clean consumer PC: Windows Server with developer tools, no real sign-in, no Smart App Control,
// no GPU. The Lenovo run (LENOVO-START-HERE.md) stays the acceptance test; this catches regressions.
// The report never contains keys, tokens or file contents.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFile}=require('node:child_process');
const run=(exe,args,options={})=>new Promise(resolve=>execFile(exe,args,{windowsHide:true,timeout:options.timeout||120000,maxBuffer:8*1024*1024,...options},(error,stdout,stderr)=>resolve({ok:!error,code:error?.code??0,stdout:String(stdout||''),stderr:String(stderr||'')})));
const ps=async(script,timeout)=>(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout})).stdout.trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const APPDATA=process.env.APPDATA,LOCALAPPDATA=process.env.LOCALAPPDATA,ENGINE=path.join(LOCALAPPDATA,'Rennie','engine');
const PORT=9223,MODEL='qwen3.5-4b';

// ---- report ----
const steps=[];let current='';
const part=name=>{current=name;};
function record(id,name,status,detail='',core=true,seconds=null){steps.push({part:current,id,name,status,detail:String(detail).slice(0,400),core,seconds});console.log(`[${status.toUpperCase()}] ${current} ${id} ${name}${detail?' — '+String(detail).slice(0,200):''}`);}
const check=(id,name,ok,detail,core=true,seconds)=>record(id,name,ok?'pass':'fail',detail,core,seconds);
async function timed(fn){const t=Date.now();const value=await fn();return [value,Math.round((Date.now()-t)/1000)];}
function writeReport(title){
  const rows=steps.map(s=>`| ${s.part} | ${s.id} | ${s.name} | ${{pass:'✅ pass',fail:'❌ FAIL',limited:'⚠️ runner limit',untested:'— untested',info:'ℹ️'}[s.status]||s.status} | ${s.seconds??''} | ${s.detail.replace(/\|/g,'\\|').replace(/\n/g,' ')} |`);
  const failed=steps.filter(s=>s.status==='fail'&&s.core);
  const md=[`## ${title}`,'',failed.length?`**${failed.length} core check(s) failed.**`:'**All core checks passed.**','',
    'Throwaway GitHub Actions Windows VM: not a clean consumer PC, no real sign-in, no Smart App Control, no GPU. The Lenovo run stays the acceptance test.','',
    '| Part | Step | Check | Result | s | Detail |','|---|---|---|---|---:|---|',...rows,''].join('\n');
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
  fs.mkdirSync('sandbox-report',{recursive:true});
  fs.writeFileSync(path.join('sandbox-report',title.replace(/\W+/g,'-').toLowerCase()+'.json'),JSON.stringify(steps,null,2));
  fs.writeFileSync(path.join('sandbox-report',title.replace(/\W+/g,'-').toLowerCase()+'.md'),md);
  return failed.length;
}

// ---- the installed app ----
async function install(installer){const [r,s]=await timed(()=>run(installer,['/S'],{timeout:600000}));await sleep(3000);return {ok:r.ok,seconds:s};}
function installed(){
  const root=path.join(LOCALAPPDATA,'Programs');
  for(const dir of fs.existsSync(root)?fs.readdirSync(root):[])for(const exe of ['Rennie.exe','Foxsocket.exe']){const file=path.join(root,dir,exe);if(fs.existsSync(file))return {dir:path.join(root,dir),exe:file,name:exe};}
  return null;
}
// Ends the app's own processes only (no /T): the model server it started keeps running, as after a normal close.
async function closeApp(){for(const image of ['Rennie.exe','Foxsocket.exe'])await run('taskkill.exe',['/IM',image,'/F']);await sleep(2000);}
async function launch(){
  await closeApp();
  const app=installed();if(!app)throw Error('the installed app was not found');
  spawn(app.exe,[`--remote-debugging-port=${PORT}`],{detached:true,stdio:'ignore',windowsHide:false}).unref();
  for(let i=0;i<90;i++){
    try{const pages=await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();const page=pages.find(p=>p.type==='page'&&p.webSocketDebuggerUrl);
      if(page){const c=await connect(page.webSocketDebuggerUrl);for(let j=0;j<60;j++){if(await c.evaluate("typeof desktop!=='undefined'&&document.readyState==='complete'"))return c;await sleep(1000);}}}catch{}
    await sleep(1000);
  }
  throw Error('the app did not open its window');
}
async function connect(url){
  const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('debug connection failed'));});
  let id=0;const pending=new Map();ws.onmessage=event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params)=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async(expression,timeoutMs=120000)=>{
    const reply=await Promise.race([send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}),sleep(timeoutMs).then(()=>({timeout:true}))]);
    if(reply.timeout)throw Error('no answer within '+Math.round(timeoutMs/1000)+' s');
    if(reply.result?.exceptionDetails)throw Error(reply.result.exceptionDetails.exception?.description?.split('\n')[0]||'failed');
    return reply.result?.result?.value;
  };
  return {evaluate,invoke:(name,arg,timeoutMs)=>evaluate(`desktop.invoke(${JSON.stringify(name)}${arg===undefined?'':','+JSON.stringify(arg)})`,timeoutMs),close:()=>ws.close()};
}
async function waitForSetup(c,timeoutMs){
  const began=Date.now();let last=null;const phases=[];
  while(Date.now()-began<timeoutMs){
    try{last=await c.invoke('local-status');}catch{}
    if(last?.phase&&phases.at(-1)!==last.phase)phases.push(last.phase);
    if(last&&!last.busy&&['ready','attention'].includes(last.phase))break;
    await sleep(10000);
  }
  return {state:last,phases,seconds:Math.round((Date.now()-began)/1000)};
}
async function ask(c,text){
  // Leave room beyond OpenClaw's 15-minute reply budget and its CLI shutdown grace.
  const [result,seconds]=await timed(async()=>{try{const state=await c.invoke('chat',text,17*60000);const last=state.chat.at(-1);return {ok:last?.role==='assistant',text:String(last?.text||''),provider:last?.provider};}catch(error){return {ok:false,error:error.message};}});
  return {...result,seconds};
}
// Rennie's own server only: llama-server.exe running from its engine folder.
const serverCount=()=>ps(`$d=Join-Path $env:LOCALAPPDATA 'Rennie\\engine';@(Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'"|Where-Object{$_.ExecutablePath -like "$d\\*"}).Count`).then(Number);
const stopServer=()=>ps(`$d=Join-Path $env:LOCALAPPDATA 'Rennie\\engine';Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'"|Where-Object{$_.ExecutablePath -like "$d\\*"}|ForEach-Object{Stop-Process -Id $_.ProcessId -Force;Wait-Process -Id $_.ProcessId -Timeout 15 -ErrorAction SilentlyContinue}`);
const taskExists=async()=>(await run('schtasks.exe',['/Query','/TN','Rennie model server'])).ok;
// The newest OpenClaw log file's last lines. Long hex strings and anything after key/token/secret/password are blanked.
async function openclawLogTail(){
  const out=await ps("$f=Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.openclaw') -Recurse -File -Include *.log,*.jsonl -ErrorAction SilentlyContinue|Sort-Object LastWriteTime -Descending|Select-Object -First 1;if($f){$f.Name;Get-Content -LiteralPath $f.FullName -Tail 12}");
  return out.replace(/[0-9a-f]{32,}/gi,'<hex>').replace(/((?:api[_-]?key|token|secret|password|authorization)["'\s:=]+(?:bearer\s+)?)[^\s"',}]+/gi,'$1<blanked>').replace(/\r?\n/g,' / ').slice(0,390);
}
async function waitFor(fn,seconds){for(let i=0;i<seconds;i++){if(await fn())return true;await sleep(1000);}return false;}

// ---- full: clean install to uninstall ----
async function full(installer){
  part('Before');
  const node=(await run('where.exe',['node'])).ok,claw=fs.existsSync(path.join(APPDATA,'npm','openclaw.cmd'))||fs.existsSync(path.join(os.homedir(),'.openclaw'));
  record('2','Baseline',claw?'fail':'info',`OpenClaw present: ${claw}; Node.js present: ${node} (runner image); Windows: ${os.release()}`,true);

  part('A');
  const inst=await install(installer);const app=installed();
  check('5','Install silently',inst.ok&&!!app,app?`${app.name} in ${path.basename(app.dir)}`:'not found',true,inst.seconds);
  check('5b','Program is Rennie.exe',app?.name==='Rennie.exe',app?.name);
  let c=await launch();
  const pc=await c.invoke('local-pc',MODEL).catch(error=>({error:error.message}));
  check('6','Recommends Qwen3.5 4B on the processor',pc?.recommended===MODEL,`recommended ${pc?.recommended}; reason "${pc?.recommendedReason}"; download ${((pc?.download||0)/2**30).toFixed(1)} GB; space ${((pc?.space||0)/2**30).toFixed(1)} GB; enough space ${pc?.enoughSpace}`);
  await c.invoke('local-prepare',{model:MODEL,agentName:'Sandbox'});
  const setup=await waitForSetup(c,70*60000);
  check('7-9','Setup reaches ready',setup.state?.phase==='ready',setup.state?.phase==='ready'?`phases: ${setup.phases.join(' → ')}; first reply "${String(setup.state.reply||'').slice(0,80)}"`:`stopped at ${setup.state?.failedPhase||setup.state?.phase}: ${setup.state?.error||'timeout'}`,true,setup.seconds);
  if(setup.state?.phase!=='ready'){record('A-log','Setup log (last lines)','info',(setup.state?.log||[]).slice(-8).join(' / '),false);record('A-openclaw','OpenClaw log (last lines, secrets blanked)','info',await openclawLogTail(),false);return;}
  check('7b','Engine is llama.cpp',setup.state.engine==='llama',setup.state.engine);
  record('8','Interrupted download','untested','not simulated in the sandbox',false);

  part('B');
  for(const [id,text,accept] of [['11a','This is an installation test. What is 7 plus 5? Answer in one short sentence.',t=>/\b(12|twelve)\b/i.test(t)],['11b','Reply with only the word blue.',t=>/^blue[.!]?$/i.test(t.trim())],['11c','In one sentence, how do I keep a laptop battery healthy?',t=>t.length>20]]){
    const r=await ask(c,text);check(id,text.slice(0,40),r.ok&&accept(r.text)&&r.provider==='openclaw',r.ok?`"${r.text.slice(0,120)}" via ${r.provider}`:r.error,true,r.seconds);
  }

  part('C');
  const listen=await ps("@(Get-NetTCPConnection -State Listen -LocalPort 18080 -ErrorAction SilentlyContinue|Select-Object -ExpandProperty LocalAddress -Unique) -join ','");
  check('13','Server listens on 127.0.0.1 only',listen==='127.0.0.1',listen||'nothing listening');
  const cmd=await ps(`$d=Join-Path $env:LOCALAPPDATA 'Rennie\\engine';@(Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'"|Where-Object{$_.ExecutablePath -like "$d\\*"}|Select-Object -ExpandProperty CommandLine) -join '|'`);
  check('14','One server from the engine folder, key from a file, no key on the command line',cmd&&!cmd.includes('|')&&cmd.includes('--api-key-file')&&!/--api-key\s+(?!file)\S/.test(cmd.replace('--api-key-file','')),cmd?`${cmd.split('|').length} process(es); --api-key-file ${cmd.includes('--api-key-file')}; --no-webui ${cmd.includes('--no-webui')}`:'no process');
  let config='';try{config=fs.readFileSync(path.join(os.homedir(),'.openclaw','openclaw.json'),'utf8');}catch{}
  check('15','OpenClaw points at the llama.cpp server, lean mode on',config.includes('http://127.0.0.1:18080/v1')&&config.includes(`llama-cpp/${MODEL}`)&&/localModelLean"?\s*:\s*true/.test(config),`provider url ${config.includes('http://127.0.0.1:18080/v1')}; model ${config.includes(`llama-cpp/${MODEL}`)}; lean ${/localModelLean"?\s*:\s*true/.test(config)}`);
  const noKey=await fetch('http://127.0.0.1:18080/v1/models').then(r=>r.status).catch(()=>0);
  check('16','No key: refused',noKey===401,`HTTP ${noKey}`);

  part('D');
  await closeApp();c.close();
  c=await launch();let r=await ask(c,'Reply with only the word blue.');
  check('17','Reopen and reply',r.ok,r.ok?`"${r.text.slice(0,60)}"`:r.error,true,r.seconds);
  const status=await c.invoke('local-status');
  record('17b','Reopen does not repeat setup checks (Lenovo finding 7)',/Checking a fresh reply|Asking the selected model/i.test(String(status.message))?'fail':'info',`status message: "${String(status.message).slice(0,120)}"`,false);
  await closeApp();c.close();await stopServer();
  const task=await taskExists();check('18a','Sign-in task exists',task,'Rennie model server');
  if(task){const started=(await run('schtasks.exe',['/Run','/TN','Rennie model server'])).ok;const up=started&&await waitFor(async()=>await serverCount()===1,180);
    record('18b','Sign-in task starts the server (run by hand; no real sign-in here)',up?'pass':'limited',up?'server running from the task':'the runner may not run interactive tasks',false);}
  c=await launch();r=await ask(c,'Reply with only the word blue.');
  check('19','Reply after the simulated restart',r.ok,r.ok?`"${r.text.slice(0,60)}"`:r.error,true,r.seconds);
  record('19b','First reply after restart','info',`${r.seconds} s (Lenovo: ~230 s)`,false);

  part('E');
  await stopServer();
  r=await ask(c,'Reply with only the word blue.');
  record('20a','Server stopped: what Rennie says','info',r.ok?`unexpectedly replied: "${r.text.slice(0,80)}"`:`"${String(r.error).slice(0,200)}"`,false);
  const gw=await c.invoke('gateway').catch(e=>({error:e.message}));record('20b','Status while the server is down','info',JSON.stringify({ok:gw.ok,error:gw.error||gw.message}).slice(0,200),false);
  await c.invoke('local-prepare',{model:MODEL});let again=await waitForSetup(c,20*60000);
  r=await ask(c,'Reply with only the word blue.');
  check('20c','Resume setup brings replies back',again.state?.phase==='ready'&&r.ok,r.ok?`ready in ${again.seconds} s; "${r.text.slice(0,40)}"`:(again.state?.error||r.error),true,again.seconds);
  const clawCmd=await ps("$env:Path=[Environment]::GetEnvironmentVariable('Path','User')+';'+[Environment]::GetEnvironmentVariable('Path','Machine');(Get-Command openclaw.cmd -ErrorAction SilentlyContinue).Source");
  const stopped=clawCmd?await run('cmd.exe',['/d','/c',clawCmd,'gateway','stop'],{timeout:120000}):{ok:false,stderr:'openclaw.cmd not found on the saved PATH'};
  record('21a','openclaw.cmd gateway stop',stopped.ok?'info':'limited',stopped.ok?'stopped':(stopped.stderr||stopped.stdout).slice(0,160),false);
  r=await ask(c,'Reply with only the word blue.');
  record('21b','Gateway stopped: what Rennie says','info',r.ok?`replied anyway: "${r.text.slice(0,60)}"`:`"${String(r.error).slice(0,200)}"`,false);
  const doctor=await c.invoke('openclaw-doctor',undefined,300000).catch(e=>({error:e.message}));
  record('21c','OpenClaw doctor','info',doctor.error||`ok ${doctor.ok}; ${doctor.findings?.length??0} finding(s): ${(doctor.findings||[]).slice(0,3).map(f=>f.checkId).join(', ')}`,false);
  const repair=await c.invoke('openclaw-repair',undefined,15*60000).catch(e=>({error:e.message}));
  r=await ask(c,'Reply with only the word blue.');
  if(!r.ok){await c.invoke('local-prepare',{model:MODEL});await waitForSetup(c,20*60000);r=await ask(c,'Reply with only the word blue.');}
  check('21d','Repair (or Resume setup) brings replies back',r.ok,`repair ${repair.error||'ran, ok '+repair.ok}; ${r.ok?`"${r.text.slice(0,40)}"`:r.error}`,true,r.seconds);

  part('F');
  const model=path.join(ENGINE,'models','Qwen3.5-4B-Q4_K_M.gguf');const before=fs.existsSync(model)?fs.statSync(model).mtimeMs:null;
  await closeApp();c.close();
  const re=await install(installer);
  const after=fs.existsSync(model)?fs.statSync(model).mtimeMs:null;
  check('22a','Reinstall keeps the model and the task',re.ok&&before!==null&&before===after&&await taskExists(),`model kept ${before!==null&&before===after}; task ${await taskExists()}`,true,re.seconds);
  c=await launch();r=await ask(c,'Reply with only the word blue.');
  check('22b','Reply after reinstall',r.ok,r.ok?`"${r.text.slice(0,40)}"`:r.error,true,r.seconds);

  part('G');
  await closeApp();c.close();
  const dir=installed()?.dir,uninstaller=dir&&fs.readdirSync(dir).find(f=>/^Uninstall .*\.exe$/i.test(f));
  const un=uninstaller?await run(path.join(dir,uninstaller),['/S'],{timeout:600000}):{ok:false};
  await waitFor(async()=>!fs.existsSync(path.join(LOCALAPPDATA,'Rennie')),120);
  const leftTask=await taskExists(),leftServer=await serverCount(),leftEngine=fs.existsSync(path.join(LOCALAPPDATA,'Rennie')),keptClaw=fs.existsSync(path.join(os.homedir(),'.openclaw'));
  if(leftEngine)record('23-left','Left in %LOCALAPPDATA%\\Rennie','info',await ps("Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Rennie') -Recurse -Force -ErrorAction SilentlyContinue|Select-Object -First 15|ForEach-Object{$_.FullName.Substring($env:LOCALAPPDATA.Length+8)+' '+$_.Length}"),false);
  check('23','Uninstall removes task, server and engine; OpenClaw stays',un.ok&&!leftTask&&leftServer===0&&!leftEngine&&keptClaw,`task left ${leftTask}; servers left ${leftServer}; %LOCALAPPDATA%\\Rennie left ${leftEngine}; OpenClaw kept ${keptClaw}`);
}

// ---- upgrade: pre-rename build → this build ----
async function upgrade(oldInstaller,newInstaller){
  part('H');
  let r=await install(oldInstaller);let app=installed();
  check('24','Install the pre-rename build',r.ok&&app?.name==='Foxsocket.exe',app?.name,true,r.seconds);
  let c=await launch();
  await c.invoke('save',{notes:'Sandbox upgrade note',tasks:[{id:'sandbox-1',text:'Sandbox upgrade task',done:false}]});
  const startup=await c.invoke('startup',true).catch(()=>null);
  await closeApp();c.close();
  check('25','Old profile written to %APPDATA%\\Foxsocket',fs.existsSync(path.join(APPDATA,'Foxsocket','state.json')),`start at sign-in set: ${startup}`);
  r=await install(newInstaller);app=installed();
  check('26a','Program is now Rennie.exe and Foxsocket.exe is gone',r.ok&&app?.name==='Rennie.exe'&&!fs.existsSync(path.join(app.dir,'Foxsocket.exe')),app?`${app.name} in ${path.basename(app.dir)}; Foxsocket.exe left ${fs.existsSync(path.join(app.dir,'Foxsocket.exe'))}`:'not found',true,r.seconds);
  c=await launch();await sleep(3000);const state=await c.invoke('state');
  check('26b','Tasks and notes survived',state.notes==='Sandbox upgrade note'&&state.tasks?.some(t=>t.id==='sandbox-1'),`notes ${state.notes==='Sandbox upgrade note'}; task ${state.tasks?.some(t=>t.id==='sandbox-1')}`);
  check('26c','Profile moved to %APPDATA%\\Rennie, old folder gone',fs.existsSync(path.join(APPDATA,'Rennie','state.json'))&&!fs.existsSync(path.join(APPDATA,'Foxsocket')),`Rennie ${fs.existsSync(path.join(APPDATA,'Rennie'))}; Foxsocket left ${fs.existsSync(path.join(APPDATA,'Foxsocket'))}`);
  const entries=await ps("(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue).PSObject.Properties|Where-Object{$_.Value -match 'Rennie\\.exe|Foxsocket\\.exe'}|ForEach-Object{[IO.Path]::GetFileName(($_.Value -replace '\"','').Split(' ')[0])}");
  check('26d','"Start at sign-in" now points at Rennie.exe',/Rennie\.exe/i.test(entries)&&!/Foxsocket\.exe/i.test(entries),entries||'no entry');
  await closeApp();c.close();
}

(async()=>{
  const [mode,...files]=process.argv.slice(2);let failed=1;
  try{if(mode==='full')await full(files[0]);else if(mode==='upgrade')await upgrade(files[0],files[1]);else throw Error('usage: full <installer> | upgrade <old> <new>');}
  catch(error){record('!','Unexpected stop','fail',error.message);}
  finally{failed=writeReport(mode==='upgrade'?'Sandbox upgrade from the pre-rename build':'Sandbox acceptance: clean install to uninstall');await closeApp().catch(()=>{});}
  process.exit(failed?1:0);
})();
