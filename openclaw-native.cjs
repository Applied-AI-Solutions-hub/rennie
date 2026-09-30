'use strict';
// OpenClaw is Foxsocket's agent backbone. This module installs OpenClaw with
// its own official Windows installer, configures it to use the local Ollama
// model, keeps its gateway service running, and talks to the agent through the
// official CLI. Chat, memory, skills and diagnostics (`openclaw doctor`) stay
// in OpenClaw; Foxsocket only guides setup and explains problems.
//
// Everything runs natively on Windows: no WSL, no virtualization settings.
// Processes are started directly (node.exe + OpenClaw's entry script), never
// through cmd.exe, and chat text is passed in a file, so nothing a user types
// can be interpreted as a command.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {download,sleep}=require('./download.cjs');
const {validateModel}=require('./local-model.cjs');

// OpenClaw's installer script is not code-signed, and the openclaw.ai copy
// changes with every release. Foxsocket downloads it from the exact release
// commit and refuses to run it unless its SHA-256 matches the reviewed copy.
// Bumping VERSION means reviewing the new script and updating all three together.
const VERSION='2026.9.3';
const INSTALL_COMMIT='1391f7cd2d40ab5bbcf2f5f831d3a64f520e72d7';
const INSTALL_SCRIPT=`https://raw.githubusercontent.com/openclaw/openclaw/${INSTALL_COMMIT}/scripts/install.ps1`;
const INSTALL_SHA256='45e7018560c5749d5b729ab7ec0609b41a30ad942d2a52b06901d91c9af2ce0f';
const OLLAMA_URL='http://127.0.0.1:11434';
const AGENT='main';
const NAME=/^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,39}$/u;
const SESSION=/^agent:[\w.-]{1,80}:[\w.:-]{1,160}$/;

function runProcess(exe,args,{env,timeout=120000,onLine=()=>{}}={}){
  return new Promise(resolve=>{
    let stdout='',stderr='',pending='',done=false,timer=null,child;
    const finish=(code,extra={})=>{if(done)return;done=true;clearTimeout(timer);if(pending.trim())onLine(pending.trim());resolve({code,stdout,stderr,timedOut:false,...extra});};
    try{child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});}catch(error){finish(null,{error:error.message});return;}
    const cap=text=>text.length>1048576?text.slice(-1048576):text;
    const lines=chunk=>{pending+=chunk;let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i).replace(/\r$/,'');pending=pending.slice(i+1);if(line.trim())onLine(line);}};
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',c=>{stdout=cap(stdout+c);lines(c);});
    child.stderr.on('data',c=>{stderr=cap(stderr+c);lines(c);});
    timer=setTimeout(()=>{child.kill();finish(null,{timedOut:true});},timeout);
    child.on('error',error=>finish(null,{error:error.message}));
    child.on('close',code=>finish(code));
  });
}
const plain=line=>String(line).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').trim();
const json=(text,open='{')=>{const start=String(text).indexOf(open);if(start<0)throw Error('no JSON');return JSON.parse(String(text).slice(start));};
const keep=(list,item,max)=>{list.push(item);if(list.length>max)list.shift();};
// Shared with the Ubuntu/WSL path (workspace-main.js): same CLI output, different transport.
function parseAgents(raw){const list=json(raw,'[');if(!Array.isArray(list))throw Error('OpenClaw returned an unexpected agent list.');return list.filter(a=>typeof a.id==='string'&&/^[\w.-]{1,80}$/.test(a.id)).map(a=>({id:a.id,name:String(a.identityName||a.name||a.id).slice(0,64)}));}
// `openclaw agent --json` does not use one shape. Seen from OpenClaw 2026.9.3 on Windows (2026-09-28):
//   via the gateway: {runId, status:'ok', summary, result:{payloads:[{text}], meta:{agentMeta:{provider, model}}}}
//   with --local:    {payloads:[{text}], meta:{agentMeta:{provider, model}}}
// and as documented: {ok, status, final, model, provider, error:{message}}.
function readAgentReply(j){
  const run=j.result||j,meta=run.meta?.agentMeta||{};
  const text=String(j.final??(Array.isArray(run.payloads)?run.payloads.map(p=>p?.text||'').join('\n'):'')).trim();
  const status=j.status||(j.ok===false?'error':text?'ok':'error');
  return {ok:status==='ok'&&j.ok!==false&&!!text,status,text,model:j.model||meta.model||null,provider:j.provider||meta.provider||null,error:j.error?.message||run.error?.message||null};
}
function expand(value,env){return value.replace(/%([^%]+)%/g,(whole,name)=>{const key=Object.keys(env).find(k=>k.toLowerCase()===name.toLowerCase());return key?env[key]:whole;});}

function createOpenClaw({directory,env=process.env,run=runProcess,fetchImpl=fetch,exists=fs.existsSync,readText=file=>fs.readFileSync(file,'utf8'),home=os.homedir(),platformName=process.platform,wait=sleep,installSha256=INSTALL_SHA256}={}){
  let located=null,lastLog=[];
  // `gateway status` starts a node process and the app asks every 30 s, so a
  // recent answer is reused. Setup, repair and failed chats force a fresh one.
  const GATEWAY_TTL=120000;let gateway={at:-Infinity,up:false,pending:null};
  // The OpenClaw installer adds Node.js and OpenClaw to the user's PATH, but a
  // running app keeps the PATH it started with. Read the current value from
  // the registry so a fresh install is found without restarting Foxsocket.
  async function registryPath(key){const r=await run('reg.exe',['query',key,'/v','Path'],{env,timeout:10000});const m=/\bPath\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(r.stdout||'');return m?m[1].trim():'';}
  async function searchDirs(){
    const [user,machine]=await Promise.all([registryPath('HKCU\\Environment'),registryPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')]);
    const all=[...String(env.PATH||env.Path||'').split(';'),...machine.split(';'),...user.split(';'),path.join(env.APPDATA||'','npm'),path.join(env.ProgramFiles||'','nodejs')];
    return [...new Set(all.map(d=>expand(d.trim(),env)).filter(d=>d&&path.isAbsolute(d)))];
  }
  function entryFor(dir){
    const pkg=path.join(dir,'node_modules','openclaw');
    if(!exists(path.join(dir,'openclaw.cmd'))||!exists(path.join(pkg,'package.json')))return null;
    try{
      const meta=JSON.parse(readText(path.join(pkg,'package.json')));
      const bin=typeof meta.bin==='string'?meta.bin:meta.bin?.openclaw;
      if(typeof bin!=='string')return null;
      const entry=path.resolve(pkg,bin);
      return entry.startsWith(pkg+path.sep)&&exists(entry)?entry:null;
    }catch{return null;}
  }
  // The location only changes when OpenClaw is installed, so it is looked up once.
  async function locate({refresh=false}={}){
    if(located&&!refresh)return located;
    const dirs=await searchDirs();
    const node=dirs.map(d=>path.join(d,'node.exe')).find(exists);
    if(!node)return located=null;
    for(const dir of dirs){const entry=entryFor(dir);if(entry)return located={node,entry,env:{...env,PATH:dirs.join(';'),NO_COLOR:'1'}};}
    return located=null;
  }
  async function cli(args,{extraEnv={},...options}={}){
    if(!located&&!await locate())throw Error('OpenClaw is not installed. Choose Resume setup.');
    return run(located.node,[located.entry,...args],{env:{...located.env,...extraEnv},...options});
  }

  function explainInstall(result,log){
    const text=log.join('\n');
    if(result.timedOut)return 'OpenClaw installation took longer than 45 minutes and was stopped. Check the internet connection, then choose Resume setup.';
    if(result.error)return 'Windows could not start the OpenClaw installer. Choose Resume setup to try again.';
    if(/ConstrainedLanguage|Application Control|blocked by (?:group )?policy|running scripts is disabled/i.test(text))return 'Windows security policy blocked the OpenClaw installer script. Rennie did not change any security settings. Ask whoever manages this PC to allow it, or see Technical details.';
    if(/Could not install Node\.js/i.test(text))return 'OpenClaw needs Node.js, which could not be installed automatically. If Windows asked for permission, choose Resume setup and approve it. Otherwise see Technical details.';
    if(/getaddrinfo|ENOTFOUND|ETIMEDOUT|ECONNRESET|could not resolve|unable to connect/i.test(text))return 'The OpenClaw installer lost its internet connection. Choose Resume setup when you are back online.';
    if(/npm (?:ERR!|error)|EACCES|EPERM|ENOSPC/i.test(text))return 'The OpenClaw package could not be installed'+(/ENOSPC/.test(text)?' because the disk is full':'')+'. See Technical details, then choose Resume setup.';
    return 'OpenClaw installation did not finish (code '+result.code+'). See Technical details, then choose Resume setup.';
  }
  async function install(progress=()=>{}){
    if(platformName!=='win32')throw Error('Automatic OpenClaw installation is available on Windows.');
    fs.mkdirSync(directory,{recursive:true});
    const script=path.join(directory,'openclaw-install.ps1');
    progress({phase:'installing-openclaw',message:'Downloading the official OpenClaw installer.',total:null,completed:0});
    try{await download({url:INSTALL_SCRIPT,target:script,fetchImpl,wait,maxBytes:5*1024**2});}catch{throw Error('The OpenClaw installer could not download. Check the connection and choose Resume setup.');}
    if(crypto.createHash('sha256').update(fs.readFileSync(script)).digest('hex')!==installSha256){
      fs.rmSync(script,{force:true});
      throw Error('The downloaded OpenClaw installer did not match the reviewed version, so it was deleted without running. Check your connection and choose Resume setup; if this keeps happening, update Rennie.');
    }
    progress({phase:'installing-openclaw',message:'Installing OpenClaw '+VERSION+' for your Windows account. This usually takes 5–15 minutes. Windows may ask permission to install Node.js; choose Yes.',total:null,completed:0});
    const log=[];
    const ps=path.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const result=await run(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Tag',VERSION,'-NoOnboard'],{env:{...env,OPENCLAW_NO_ONBOARD:'1',NO_COLOR:'1'},timeout:45*60*1000,onLine:line=>{const text=plain(line);if(!text)return;keep(log,text,300);progress({phase:'installing-openclaw',detail:text.slice(0,200)});}});
    fs.rmSync(script,{force:true});
    lastLog=log.slice(-80);
    if(result.code!==0)throw Error(explainInstall(result,log));
    if(!await locate({refresh:true}))throw Error('OpenClaw finished installing, but Rennie cannot find it yet. Restart Windows, then choose Resume setup.');
  }
  const configFile=()=>env.OPENCLAW_CONFIG_PATH||path.join(env.OPENCLAW_STATE_DIR||path.join(home,'.openclaw'),'openclaw.json');
  // An existing OpenClaw configuration belongs to the user. Foxsocket reuses
  // it and never re-runs onboarding over it.
  const configured=()=>{try{return fs.statSync(configFile()).size>0;}catch{return false;}};
  // target: Rennie's own llama.cpp server ({baseUrl, modelId, apiKey, thinking}). Without one, the local Ollama model.
  async function onboard({model,target=null}){
    if(target){
      if(!/^http:\/\/127\.0\.0\.1:\d{2,5}\/v1$/.test(String(target.baseUrl))||!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(String(target.modelId))||!/^[0-9a-f]{64}$/.test(String(target.apiKey))||(target.thinking&&!['low','medium','high'].includes(target.thinking)))throw Error('The local model server settings are not valid. Choose Resume setup.');
    }else validateModel(model);
    if(configured())return {reused:true};
    const onLine=line=>{const text=plain(line);if(text)keep(lastLog,text,80);};
    if(target){
      // OpenClaw's own llama.cpp connector, pinned to the OpenClaw version Rennie installs.
      const plugin=await cli(['plugins','install','@openclaw/llama-cpp-provider@'+VERSION],{timeout:10*60*1000,onLine});
      if(plugin.code!==0&&!/already installed/i.test(plugin.stdout+plugin.stderr))throw Error('OpenClaw could not add its llama.cpp connector'+(plugin.timedOut?' within 10 minutes':'')+'. Check the internet connection, see Technical details, then choose Resume setup.');
    }
    const provider=target?['--auth-choice','llama-cpp-existing-server','--custom-base-url',target.baseUrl,'--custom-model-id',target.modelId]:['--auth-choice','ollama','--custom-base-url',OLLAMA_URL,'--custom-model-id',model];
    const args=['onboard','--non-interactive','--accept-risk','--mode','local',...provider,'--install-daemon','--gateway-bind','loopback','--skip-channels','--skip-search','--skip-skills','--skip-ui','--skip-health','--suppress-gateway-token-output','--json'];
    // The server key reaches OpenClaw through the connector's documented environment variable, never the command line.
    const r=await cli(args,{timeout:10*60*1000,onLine,...(target?{extraEnv:{LLAMA_SERVER_API_KEY:target.apiKey}}:{})});
    if(r.code!==0){
      const text=r.stdout+'\n'+r.stderr;
      if(/tool|context/i.test(text)&&/ollama|model/i.test(text))throw Error('OpenClaw could not use '+model+' as its model. It needs a model with tool support and at least 16K context. Choose the Recommended model, then Resume setup.');
      throw Error('OpenClaw could not finish its first-time setup'+(r.timedOut?' within 10 minutes':'')+'. See Technical details, then choose Resume setup.');
    }
    // Lean mode drops OpenClaw's heaviest tools for small local models. Measured on
    // 2026-09-28: the prompt fell from ~24K to ~10K tokens, which on a CPU-only PC is the
    // difference between a first reply in minutes and a 10-minute timeout. Set only on a
    // configuration Foxsocket just created; best effort, setup still works without it.
    await cli(['config','set','agents.defaults.experimental.localModelLean','true'],{timeout:60000}).catch(()=>null);
    // Bonsai 2 scored best with medium thinking in our tests; other models keep OpenClaw's default. Best effort.
    if(target?.thinking)await cli(['config','set','agents.defaults.thinkingDefault',target.thinking],{timeout:60000}).catch(()=>null);
    return {reused:false};
  }
  async function setName(name){
    if(!NAME.test(String(name||'')))throw Error('Use 1–40 letters, numbers, spaces, periods, apostrophes or dashes for your assistant’s name.');
    const r=await cli(['agents','set-identity','--agent',AGENT,'--name',name,'--json'],{timeout:60000});
    if(r.code!==0)throw Error('OpenClaw could not save your assistant’s name. Your setup is otherwise unaffected.');
  }
  async function agents(){
    const r=await cli(['agents','list','--json'],{timeout:60000});
    if(r.code!==0)throw Error('OpenClaw could not list its agents.');
    return parseAgents(r.stdout);
  }
  function gatewayRunning({fresh=false}={}){
    if(!fresh&&Date.now()-gateway.at<GATEWAY_TTL)return Promise.resolve(gateway.up);
    return gateway.pending||(gateway.pending=cli(['gateway','status','--json','--require-rpc','--timeout','10000'],{timeout:60000}).then(r=>(gateway={at:Date.now(),up:r.code===0,pending:null}).up,error=>{gateway.pending=null;throw error;}));
  }
  const forgetGateway=()=>{gateway={...gateway,at:-Infinity};};
  async function startGateway(){
    if(await gatewayRunning({fresh:true}))return;
    let r=await cli(['gateway','start'],{timeout:120000});
    // A missing scheduled task is recreated; an existing one is only started.
    if(r.code!==0){r=await cli(['gateway','install'],{timeout:180000});if(r.code===0)r=await cli(['gateway','start'],{timeout:120000});}
    for(let i=0;i<30;i++){if(await gatewayRunning({fresh:true}))return;await wait(2000);}
    throw Error('The OpenClaw gateway did not start. Choose Run OpenClaw doctor to see why, or restart Windows and choose Resume setup.');
  }
  // A cold CPU model can spend more than five minutes reading OpenClaw's
  // initial prompt. Apply the same bounded budget to setup and later chats:
  // the first request after a Windows restart is cold too.
  async function chat({message,session,timeoutSeconds=900}){
    if(typeof message!=='string'||!message.trim())throw Error('Enter a message.');
    if(!SESSION.test(String(session)))throw Error('This conversation has an invalid session. Start a new chat.');
    fs.mkdirSync(path.join(directory,'messages'),{recursive:true});
    const file=path.join(directory,'messages',crypto.randomUUID()+'.txt');
    fs.writeFileSync(file,message,{encoding:'utf8',mode:0o600});
    try{
      const r=await cli(['agent','--session-key',session,'--message-file',file,'--json','--timeout',String(timeoutSeconds)],{timeout:(timeoutSeconds+60)*1000});
      let result;try{result=json(r.stdout);}catch{throw Error(r.timedOut?'Your assistant did not reply in time.':'OpenClaw did not return a reply. Check that its gateway is running in This PC.');}
      const reply=readAgentReply(result);
      if(!reply.ok)throw Error(reply.status==='timeout'?'Your assistant did not reply in time. The first reply after starting can take several minutes on the processor. Check This PC, then try again.':String(reply.error||'OpenClaw could not complete the reply.').slice(0,300));
      return {content:reply.text,model:reply.model,provider:reply.provider};
    }catch(error){forgetGateway();throw error;}finally{fs.rmSync(file,{force:true});}
  }
  async function doctor(){
    const r=await cli(['doctor','--json'],{timeout:180000});
    try{const parsed=json(r.stdout);return {ok:parsed.ok===true,checksRun:Number.isFinite(parsed.checksRun)?parsed.checksRun:null,checksSkipped:Number.isFinite(parsed.checksSkipped)?parsed.checksSkipped:null,findings:Array.isArray(parsed.findings)?parsed.findings.slice(0,50).map(f=>({checkId:String(f.checkId||''),severity:String(f.severity||'info'),message:String(f.message||'').slice(0,400),fixHint:String(f.fixHint||'').slice(0,600),target:f.target?String(f.target):null})):[]};}
    catch{throw Error('OpenClaw doctor did not produce a report. Check that OpenClaw is installed, then try again.');}
  }
  async function repair(){
    const r=await cli(['doctor','--fix','--non-interactive'],{timeout:10*60*1000});forgetGateway();
    return {ok:r.code===0,report:await doctor().catch(()=>null)};
  }
  return {locate,install,configured,onboard,setName,agents,gatewayRunning,startGateway,chat,doctor,repair,log:()=>[...lastLog]};
}
module.exports={createOpenClaw,runProcess,parseAgents,VERSION,INSTALL_SCRIPT};
