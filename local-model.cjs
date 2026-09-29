'use strict';
const {watchdog,backoff,sleep}=require('./download.cjs');
const {GB}=require('./preflight.cjs');
const BASE = 'http://127.0.0.1:11434';
const MODELS = Object.freeze([
  {id:'llama3.2:3b',label:'Recommended · Llama 3.2 3B',download:'About 2 GB',bytes:2.0*GB,memory:'Passed basic chat checks in our test. Best on PCs with 8 GB of memory or more; performance still depends on this PC.'},
  {id:'llama3.2:1b',label:'Small · Llama 3.2 1B (limited quality)',download:'About 1.3 GB',bytes:1.3*GB,small:true,memory:'For PCs with less than 8 GB of memory. Failed basic instruction checks in our test; not recommended for everyday chat.'},
]);
const DEFAULT_MODEL = MODELS[0].id;
// OpenClaw's session for Foxsocket's own setup checks, kept apart from the user's conversations.
const SETUP_SESSION = 'foxsocket-setup-check';
const normalized = value => value.includes(':') ? value : value + ':latest';
function validateModel(model) {
  if(typeof model!=='string'||model.length>200||!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model)||model.includes('..'))throw Error('Choose a valid local model name.');
  if(/(?:^|[:/-])cloud(?:$|[:/-])/i.test(model))throw Error('Choose an on-device model for local setup.');
  return model;
}
function createLocalApi({fetchImpl=fetch,stallMs=180000,attempts=4,pause=sleep}={}) {
  async function request(endpoint, body, timeout=10000, signal=AbortSignal.timeout(timeout)) {
    const response=await fetchImpl(BASE+endpoint,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal,cache:'no-store'});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Object.assign(Error(error.error||'Ollama returned HTTP '+response.status),{permanent:true});}
    return response;
  }
  async function installed(model) {
    validateModel(model);
    const data=await (await request('/api/tags')).json();
    if(!Array.isArray(data.models))throw Error('Ollama returned an invalid model list.');
    return data.models.some(item=>typeof item.name==='string'&&normalized(item.name)===normalized(model));
  }
  async function verify(model) {
    if(!await installed(model))throw Error('The selected model is not downloaded. Choose Set up local model.');
    const info=await (await request('/api/show',{model})).json();
    if(info.remote_host||info.remote_model)throw Error('This model uses a remote server. Choose an on-device model.');
    const checks=[];
    for(const check of require('./local-chat.cjs').CHECKS) {
      // Temperature 0 with a fixed seed: the same model gives the same answer
      // every time, so a failed check is a real signal, not a random draw.
      const data=await (await request('/api/chat',{model,messages:require('./local-chat.cjs').messages([{role:'user',content:check.prompt}]),stream:false,think:false,options:{num_predict:128,temperature:0,seed:42}},180000)).json();
      const reply=String(data.message?.content||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
      if(data.done!==true||!reply)throw Error('The selected model did not finish a text reply. Retry or choose another model.');
      if(typeof data.model!=='string'||normalized(data.model)!==normalized(model))throw Error('Ollama replied using a different model. Select it explicitly and retry.');
      if(!check.accept(reply))throw Error('Ollama and the model are installed and running, but the model answered the basic '+check.id+' check incorrectly, so its answers would be unreliable. Choose the Recommended model (or a larger one) and run setup again. Reply: '+reply.slice(0,180));
      checks.push({id:check.id,reply:reply.slice(0,500)});
    }
    return {ok:true,providerId:'local',model,reply:checks.map(c=>c.id+': '+c.reply).join(' · '),checks};
  }
  async function pullOnce(model,onProgress) {
    // No total time limit (a 2 GB model on a slow line can take hours). Abort
    // only when Ollama reports no change at all for `stallMs`; Ollama keeps the
    // downloaded layers, so the next attempt continues where this one stopped.
    const dog=watchdog(stallMs);
    const decoder=new TextDecoder();let pending='',success=false,lastKey='';
    const line=text=>{if(!text.trim())return;const item=JSON.parse(text);if(item.error)throw Object.assign(Error(item.error),{permanent:true});if(item.status==='success')success=true;
      const total=Number(item.total),completed=Number(item.completed);
      const detail=String(item.status||'').slice(0,160);
      const key=detail+':'+(Number.isFinite(completed)?completed:'');if(key!==lastKey){lastKey=key;dog.alive();}
      const message=detail==='success'?'Model download complete.':detail.startsWith('pulling')?'Downloading model files.':detail.startsWith('verifying')?'Checking downloaded model files.':detail.startsWith('writing')?'Saving the model.':'Preparing the model download.';
      onProgress({message,detail,total:Number.isFinite(total)&&total>0?total:null,completed:Number.isFinite(completed)&&completed>=0?completed:0});};
    try{
      const response=await request('/api/pull',{model,stream:true},0,dog.signal);
      if(!response.body)throw Error('Ollama did not return download progress.');
      for await(const chunk of response.body){pending+=decoder.decode(chunk,{stream:true});if(pending.length>1048576)throw Object.assign(Error('Invalid download progress response.'),{permanent:true});let pos;while((pos=pending.indexOf('\n'))>=0){line(pending.slice(0,pos));pending=pending.slice(pos+1);}}
      pending+=decoder.decode();line(pending);
    }catch(error){throw dog.stalled?Object.assign(Error('stalled'),{stalled:true}):error;}
    finally{dog.stop();}
    if(!success)throw Error('The model download was interrupted.');
  }
  async function pull(model,onProgress) {
    validateModel(model);
    let last;
    for(let attempt=1;attempt<=attempts;attempt++){
      try{return await pullOnce(model,onProgress);}catch(error){
        last=error;
        // Out of space, unknown model and similar errors will not fix themselves.
        if(error.permanent)throw error;
        if(attempt<attempts){onProgress({message:'The model download paused. Retrying and continuing where it stopped.',detail:error.stalled?'no progress':'connection interrupted',total:null,completed:0});await pause(backoff(attempt));}
      }
    }
    throw Error(last?.stalled?'The model download stopped making progress and did not recover after several automatic retries. Check the internet connection, then choose Resume setup; downloaded parts are kept.':'The model download was interrupted. Resume setup to retry; Ollama can reuse downloaded layers.');
  }
  return {installed,verify,pull,reachable:async()=>{try{await (await request('/api/tags')).json();return true;}catch{return false;}}};
}
function createLocalSetup({read=()=>null,write=()=>{},api,platform,openclaw=null,checkSpace=null,onReady=()=>{},onChange=()=>{},now=Date.now}) {
  const saved=read();
  let state={phase:'idle',model:DEFAULT_MODEL,message:'Choose a model to run on this PC.',...saved,busy:false,verified:false};
  if(saved?.busy)state={...state,phase:'interrupted',message:'Setup was interrupted. Resume to continue.',error:saved.error||null};
  if(saved?.phase==='ready')state.message='Last setup succeeded. Checking a fresh reply after reopening.';
  let job=null,verifiedModel=null,rechecked=false;
  let lastProgressAt=-Infinity;
  // Keep every update in memory, but checkpoint progress at most four times a
  // second. Transitions and terminal results bypass this limit. On interruption
  // the last checkpoint is sufficient: Ollama owns resumable model layers.
  const set=(patch,progressOnly=false)=>{
    const transition=patch.phase!==undefined&&patch.phase!==state.phase;
    const timestamp=now();
    if(transition)lastProgressAt=-Infinity;
    state={...state,...(transition?{detail:null}:{}),...patch,updatedAt:timestamp};
    if(progressOnly&&!transition&&timestamp-lastProgressAt<250)return {...state};
    if(progressOnly)lastProgressAt=timestamp;
    write({...state});onChange({...state});return {...state};
  };
  // What setup still has to download or install. One model-list read answers both
  // "is Ollama running" and "is the model there"; OpenClaw is looked up in parallel.
  async function needs(model){
    const [present,claw]=await Promise.all([api.installed(model).catch(()=>null),openclaw?openclaw.locate():true]);
    return {needsOllama:present===null&&!await platform.find(),needsModel:present!==true,modelBytes:MODELS.find(m=>m.id===model)?.bytes??null,needsOpenClaw:!claw};
  }
  async function checkBeforeDownloading(model){
    if(!checkSpace)return;
    const result=await checkSpace(await needs(model));
    if(!result.enoughSpace)throw Error(result.problem);
  }
  // install: set up anything missing. probe: send a real message through OpenClaw
  // (setup and an explicit connection test do; the quiet check on reopening does not).
  async function prepareAgent(model,{install,probe,agentName}){
    set({phase:'installing-openclaw',total:null,completed:0,message:'Checking for OpenClaw, the agent software your assistant runs on.'});
    if(!await openclaw.locate()){
      if(!install)throw Error('OpenClaw is not installed. Choose Resume setup.');
      await openclaw.install(update=>set({phase:'installing-openclaw',...update},true));
    }
    set({phase:'configuring-openclaw',message:'Setting up your OpenClaw agent to use '+model+' on this PC.'});
    let reused=openclaw.configured();
    if(install)({reused}=await openclaw.onboard({model}));
    else if(!reused)throw Error('OpenClaw is not set up yet. Choose Resume setup.');
    let nameNote=null;
    if(install&&agentName&&!reused){try{await openclaw.setName(agentName);}catch(error){nameNote=error.message;}}
    set({phase:'starting-openclaw',message:'Starting the OpenClaw gateway in the background.'});
    await openclaw.startGateway();
    const list=await openclaw.agents();
    const agent=list.find(a=>a.id==='main')||list[0];
    if(!agent)throw Error('OpenClaw has no agent configured. Choose Run OpenClaw doctor to see why.');
    // Reopening Foxsocket only checks the gateway, so it never adds messages to your agent.
    if(!probe)return {agent,reused};
    set({phase:'verifying-openclaw',message:'Asking your assistant for a reply through OpenClaw. The first reply can take a few minutes.'});
    const check=require('./local-chat.cjs').CHECKS[0];
    const reply=await openclaw.chat({message:check.prompt,session:`agent:${agent.id}:${SETUP_SESSION}`});
    // The model OpenClaw actually answered with. An existing OpenClaw setup keeps its own model.
    const agentModel=String(reply.model||'').replace(/^ollama\//,'')||null;
    return {agent,reused,nameNote,agentModel,agentReply:reply.content.slice(0,300),agentCheck:check.accept(reply.content)};
  }
  // agent: chat is routed through OpenClaw. The direct local route checks only Ollama.
  function prepare(model=state.model,{install=true,agentName=state.agentName||null,agent:viaAgent=true,probe=install}={}) {
    validateModel(model);
    if(job)return job;
    job=Promise.resolve().then(async()=>{
      verifiedModel=null;set({busy:true,phase:'checking',model,agentName,verified:false,error:null,reply:null,total:null,completed:0,message:'Checking this PC.'});
      try {
        if(install)await checkBeforeDownloading(model);
        if(!await api.reachable()) {
          if(!await platform.find()){
            if(!install)throw Error('Ollama is not installed. Choose Set up local model.');
            await platform.install(update=>set({phase:update.phase||'downloading-runtime',...update},true));
          }
          set({phase:'starting',total:null,completed:0,message:'Starting Ollama on this PC.'});await platform.start();
        }
        if(!await api.installed(model)){
          if(!install)throw Error('The selected model is not downloaded. Resume local setup to download it.');
          set({phase:'downloading-model',message:'Requesting the model download.',total:null,completed:0});
          await api.pull(model,update=>set({phase:'downloading-model',...update},true));
        }
        set({phase:'verifying',message:'Asking the selected model for a real reply. The first load can take a few minutes.',total:null,completed:0});
        const result=await api.verify(model);
        let agent=null;
        if(openclaw&&viaAgent)agent=await prepareAgent(model,{install,probe,agentName});
        verifiedModel=model;
        // Report the model OpenClaw really uses: a kept configuration may not use the one selected here.
        const used=agent?(agent.agentModel||(agent.reused?state.agentModel:model)||null):null;
        const kept=agent?.reused?(used&&normalized(used)!==normalized(model)?` Your existing OpenClaw setup was kept, so it uses ${used} rather than ${model}. Change the model in OpenClaw to switch.`:' Your existing OpenClaw settings were kept.'):'';
        const quality=agent&&agent.agentCheck===false?' Your assistant replied, but its answer to a basic check was off; small local models can give unreliable answers.':'';
        const message=agent?`Ready. Your assistant runs on OpenClaw${used?' with '+used:''} on this PC.${kept}${quality}`:'Connected. Basic arithmetic and instruction checks passed; answer quality can still vary.';
        const done=set({phase:'ready',busy:false,verified:true,message,reply:agent?.agentReply||result.reply,error:null,backbone:agent?'openclaw':'ollama',agentId:agent?.agent.id||null,agentDisplayName:agent?.agent.name||null,agentModel:used,note:agent?.nameNote||null});
        // Only an OpenClaw-verified setup moves chat to OpenClaw; the direct local route never does.
        if(agent)onReady(done);
        return done;
      } catch(error){verifiedModel=null;return set({phase:'attention',failedPhase:state.phase,busy:false,verified:false,error:error.message,message:'Setup needs attention. Retry to continue.'});}
    }).finally(()=>job=null);return job;
  }
  // `agent`: the caller routes chat through OpenClaw, so its gateway must be up too.
  async function status(model,{agent=false}={}) {
    validateModel(model);
    if(!rechecked&&saved?.phase==='ready'&&saved.model===model){rechecked=true;await prepare(model,{install:false,agent,probe:false});}
    if(state.busy)return {ok:false,providerId:'local',model,error:'Local setup is still running.'};
    try {
      if(!await api.reachable()){verifiedModel=null;return {ok:false,providerId:'local',model,error:'Ollama is not running. Resume local setup to start it.'};}
      if(!await api.installed(model)){verifiedModel=null;return {ok:false,providerId:'local',model,error:'The selected model is not downloaded.'};}
      if(agent&&openclaw&&!await openclaw.gatewayRunning())return {ok:false,providerId:'openclaw',model,error:'The OpenClaw gateway is not running. Resume setup to start it.'};
      return {ok:verifiedModel===model,providerId:agent?'openclaw':'local',model,error:verifiedModel===model?null:'Verify a real reply to finish setup.'};
    }catch(error){verifiedModel=null;return {ok:false,providerId:'local',model,error:error.message};}
  }
  // An explicit connection test sends a real message through OpenClaw when chat goes there.
  return {prepare,verify:(model,{agent=true}={})=>prepare(model,{install:false,agent,probe:true}),status,needs,get:()=>({...state}),invalidate:()=>{verifiedModel=null;},models:MODELS};
}
module.exports={createLocalApi,createLocalSetup,MODELS,DEFAULT_MODEL,validateModel};
