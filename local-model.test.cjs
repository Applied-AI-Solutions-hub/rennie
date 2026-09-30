const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLocalApi,createLocalSetup,DEFAULT_MODEL}=require('./local-model.cjs');
const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
test('a reachable Ollama server without the selected model is never ready',async()=>{
 let generated=false;const api=createLocalApi({fetchImpl:async(url)=>{if(url.endsWith('/api/chat'))generated=true;return response({models:[{name:'another:latest'}]});}});
 await assert.rejects(api.verify(DEFAULT_MODEL),/not downloaded/);assert.equal(generated,false);
});
test('verification requires a finished visible reply from the exact selected local model',async()=>{
 const calls=[];let reply=null;
 const api=createLocalApi({fetchImpl:async(url,options)=>{calls.push([url,options]);if(url.endsWith('/api/tags'))return response({models:[{name:DEFAULT_MODEL}]});if(url.endsWith('/api/show'))return response({});return response(reply||{model:DEFAULT_MODEL,done:true,message:{content:JSON.parse(options.body).messages.at(-1).content.includes('7 plus 5')?'12':'blue'}});}});
 assert.equal((await api.verify(DEFAULT_MODEL)).checks.length,2);
 assert.equal(JSON.parse(calls.at(-1)[1].body).model,DEFAULT_MODEL);assert.ok(calls.every(([,opts])=>opts.signal));
 for(const value of [{model:DEFAULT_MODEL,done:false,message:{content:'12'}},{model:DEFAULT_MODEL,done:true,message:{content:''}},{model:'wrong:1b',done:true,message:{content:'12'}},{model:DEFAULT_MODEL,done:true,message:{content:'I have access to device notes about Applied.'}}]){reply=value;await assert.rejects(api.verify(DEFAULT_MODEL));}
});
test('cloud aliases are rejected before generation',async()=>{
 let calls=0;const api=createLocalApi({fetchImpl:async url=>{calls++;return response(url.endsWith('/api/tags')?{models:[{name:DEFAULT_MODEL}]}:{remote_host:'https://cloud.example'});}});
 await assert.rejects(api.verify(DEFAULT_MODEL),/remote server/);assert.equal(calls,2);
 await assert.rejects(api.installed('gpt-oss:120b-cloud'),/on-device/);
});
test('streamed download handles chunk boundaries and requires final success',async()=>{
 const updates=[];let payload='{"status":"pulling","total":100,"completed":42}\n{"status":"success"}\n';
 const api=createLocalApi({pause:async()=>{},fetchImpl:async()=>new Response(new ReadableStream({start(controller){for(const part of [payload.slice(0,9),payload.slice(9)])controller.enqueue(new TextEncoder().encode(part));controller.close();}}))});
 await api.pull(DEFAULT_MODEL,p=>updates.push(p));assert.equal(updates[0].completed,42);assert.equal(updates[0].total,100);
 assert.equal(updates[0].message,'Downloading model files.');assert.equal(updates[0].detail,'pulling');
 payload='{"status":"pulling","completed":42}\n';await assert.rejects(api.pull(DEFAULT_MODEL,()=>{}),/interrupted/);
 payload='{"error":"out of space"}\n';await assert.rejects(api.pull(DEFAULT_MODEL,()=>{}),/out of space/);
});

test('progress bursts are checkpointed, transitions flush, and the checkpoint can resume',async()=>{
 let time=0,release;const writes=[],updates=[];
 const pause=new Promise(resolve=>release=resolve);
 const api={reachable:async()=>true,installed:async()=>false,pull:async(_,progress)=>{
  for(time=0;time<1000;time++)progress({completed:time,total:1000,message:'Downloading model files.'});
  await pause;
 },verify:async()=>({reply:'12 / blue'})};
 const manager=createLocalSetup({api,platform:{},now:()=>time,write:s=>writes.push(s),onChange:s=>updates.push(s)});
 const job=manager.prepare(DEFAULT_MODEL);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(manager.get().completed,999,'memory retains the latest record');
 const checkpoints=writes.filter(s=>s.phase==='downloading-model'&&s.message==='Downloading model files.');
 assert.equal(checkpoints.length,4,'1000 progress records produce four checkpoints');
 assert.equal(checkpoints.at(-1).completed,750);
 assert.equal(updates.length,writes.length);
 const resumed=createLocalSetup({api,platform:{},read:()=>writes.at(-1)});
 assert.equal(resumed.get().phase,'interrupted');assert.equal(resumed.get().model,DEFAULT_MODEL);
 release();await job;
 assert.equal(writes.at(-2).phase,'verifying');assert.equal(writes.at(-1).phase,'ready');
 assert.equal(writes.at(-1).busy,false);assert.equal(writes.at(-1).verified,true);
});

test('an error immediately flushes even inside the progress throttle window',async()=>{
 const writes=[];
 const api={reachable:async()=>true,installed:async()=>false,pull:async(_,progress)=>{
  progress({completed:1,total:10});progress({completed:2,total:10});throw Error('download stopped');
 }};
 const manager=createLocalSetup({api,platform:{},now:()=>0,write:s=>writes.push(s)});
 await manager.prepare(DEFAULT_MODEL);
 assert.equal(writes.at(-1).phase,'attention');assert.equal(writes.at(-1).error,'download stopped');
 assert.equal(writes.at(-1).completed,2);assert.equal(writes.at(-1).busy,false);
});
function fixture(saved=null){
 const calls=[],writes=[],updates=[];let reachable=false,downloaded=false,failure=null;
 const api={reachable:async()=>reachable,installed:async()=>downloaded,pull:async(model,progress)=>{calls.push('pull');progress({completed:10,total:20,message:'downloading'});if(failure)throw Error(failure);downloaded=true;},verify:async model=>{calls.push('verify');if(failure)throw Error(failure);return {ok:true,model,reply:'hello'};}};
 const platform={find:async()=>{calls.push('find');return reachable?'ollama.exe':null;},install:async progress=>{calls.push('install');progress({phase:'installing-runtime',message:'Installing'});},start:async()=>{calls.push('start');reachable=true;}};
 const manager=createLocalSetup({api,platform,read:()=>saved,write:value=>writes.push({...value}),onChange:value=>updates.push(value)});
 return {manager,calls,writes,updates,setOnline:value=>reachable=value,setDownloaded:value=>downloaded=value,setFailure:value=>failure=value};
}
test('fresh setup installs, starts, downloads and verifies in order; concurrent clicks coalesce',async()=>{
 const f=fixture();const first=f.manager.prepare(DEFAULT_MODEL);assert.equal(first,f.manager.prepare(DEFAULT_MODEL));await first;
 assert.deepEqual(f.calls,['find','install','start','pull','verify']);assert.equal(f.manager.get().verified,true);assert.equal((await f.manager.status(DEFAULT_MODEL)).ok,true);
 assert.ok(f.updates.some(s=>s.total===20&&s.completed===10));assert.equal((await f.manager.status('different-model:latest')).ok,false);
 f.setOnline(false);assert.equal((await f.manager.status(DEFAULT_MODEL)).ok,false);f.setOnline(true);assert.equal((await f.manager.status(DEFAULT_MODEL)).ok,false);
});
test('download failures and interrupted sessions retain the model and last result',async()=>{
 const f=fixture();f.setFailure('disk full');await f.manager.prepare(DEFAULT_MODEL);assert.equal(f.manager.get().error,'disk full');assert.equal(f.manager.get().verified,false);
 f.setFailure(null);await f.manager.prepare(DEFAULT_MODEL);assert.equal(f.manager.get().verified,true);
 const resumed=fixture({phase:'downloading-model',busy:true,model:'llama3.2:3b',error:'previous failure'});assert.equal(resumed.manager.get().phase,'interrupted');assert.equal(resumed.manager.get().model,'llama3.2:3b');assert.equal(resumed.manager.get().error,'previous failure');
});
test('an existing setup is rechecked after app restart without reinstalling, downloading or asking the model again',async()=>{
 const f=fixture({phase:'ready',model:DEFAULT_MODEL,verified:true});f.setOnline(true);f.setDownloaded(true);
 assert.equal(f.manager.get().verified,false);assert.equal((await f.manager.status(DEFAULT_MODEL)).ok,true);await f.manager.status(DEFAULT_MODEL);assert.deepEqual(f.calls,[],'setup already verified this model (Lenovo finding 7)');
});
test('a verification-only check cannot install software or download a model',async()=>{
 const f=fixture();await f.manager.verify(DEFAULT_MODEL);assert.deepEqual(f.calls,['find']);assert.equal(f.manager.get().verified,false);
 f.setOnline(true);await f.manager.verify(DEFAULT_MODEL);assert.equal(f.manager.get().verified,false);assert.equal(f.calls.includes('pull'),false);
});
test('a model download that stops making progress is retried and continues without a total time limit',async()=>{
 const lines=text=>new TextEncoder().encode(text);let calls=0;const updates=[];
 const api=createLocalApi({stallMs:200,pause:async()=>{},fetchImpl:async(_,{signal})=>{calls++;
  if(calls===1)return new Response(new ReadableStream({start(c){c.enqueue(lines('{"status":"pulling abc","total":100,"completed":96}\n'));signal.addEventListener('abort',()=>c.error(new Error('aborted')));}}));
  return new Response('{"status":"pulling abc","total":100,"completed":100}\n{"status":"success"}\n');}});
 await api.pull(DEFAULT_MODEL,p=>updates.push(p));
 assert.equal(calls,2);assert.ok(updates.some(u=>/paused\. Retrying/.test(u.message)));
 let stuck=0;const never=createLocalApi({stallMs:10,attempts:3,pause:async()=>{},fetchImpl:async(_,{signal})=>{stuck++;return new Response(new ReadableStream({start(c){signal.addEventListener('abort',()=>c.error(new Error('aborted')));}}));}});
 await assert.rejects(never.pull(DEFAULT_MODEL,()=>{}),/stopped making progress.*downloaded parts are kept/);assert.equal(stuck,3);
});
test('answer checks are deterministic and a wrong answer says the install itself worked',async()=>{
 const bodies=[];const api=createLocalApi({fetchImpl:async(url,options)=>{if(url.endsWith('/api/tags'))return response({models:[{name:DEFAULT_MODEL}]});if(url.endsWith('/api/show'))return response({});bodies.push(JSON.parse(options.body));return response({model:DEFAULT_MODEL,done:true,message:{content:'Thirteen.'}});}});
 await assert.rejects(api.verify(DEFAULT_MODEL),/installed and running.*Recommended model/);
 assert.equal(bodies[0].options.temperature,0);assert.equal(bodies[0].options.seed,42);
});
test('not enough disk space stops setup before anything is downloaded or installed',async()=>{
 const calls=[];let needs;
 const manager=createLocalSetup({api:{reachable:async()=>false,installed:async()=>{throw Error('Ollama is not running');}},platform:{find:async()=>{calls.push('find');return null;},install:async()=>calls.push('install')},
  checkSpace:async n=>{needs=n;return {enoughSpace:false,problem:'Setup needs about 11 GB of free space on this PC, but only 3 GB is free.'};}});
 const result=await manager.prepare(DEFAULT_MODEL);
 assert.equal(result.phase,'attention');assert.match(result.error,/11 GB.*3 GB/);assert.ok(!calls.includes('install'));
 assert.equal(needs.needsOllama,true);assert.equal(needs.needsModel,true);assert.ok(needs.modelBytes>1e9);
});
function agentFixture({installed=false,configured=false,reply='The answer is 12.',replyModel='llama3.2:3b'}={}){
 const calls=[];let state={installed,configured};
 const openclaw={
  locate:async()=>{calls.push('locate');return state.installed?{}:null;},
  install:async progress=>{calls.push('install');progress({phase:'installing-openclaw',detail:'[OK] Node.js'});state.installed=true;},
  configured:()=>state.configured,
  onboard:async({model})=>{calls.push('onboard:'+model);if(state.configured)return {reused:true};state.configured=true;return {reused:false};},
  setName:async name=>calls.push('name:'+name),
  startGateway:async()=>calls.push('gateway'),gatewayRunning:async()=>true,
  agents:async()=>[{id:'main',name:'Pip'}],
  chat:async({session})=>{calls.push('chat:'+session);return {content:reply,model:replyModel};},
 };
 const api={reachable:async()=>true,installed:async()=>true,verify:async()=>({reply:'12 / blue'})};
 const ready=[];
 return {calls,ready,openclaw,make:(saved=null)=>createLocalSetup({api,platform:{find:async()=>'ollama.exe'},openclaw,read:()=>saved,onReady:s=>ready.push(s)})};
}
test('fresh setup installs OpenClaw, configures it, names the assistant and confirms a reply through OpenClaw',async()=>{
 const f=agentFixture();const phases=[];const manager=f.make();
 const result=await manager.prepare(DEFAULT_MODEL,{agentName:'Pip'});
 assert.deepEqual(f.calls,['locate','install','onboard:'+DEFAULT_MODEL,'name:Pip','gateway','chat:agent:main:foxsocket-setup-check']);
 assert.equal(result.phase,'ready');assert.equal(result.backbone,'openclaw');assert.equal(result.agentId,'main');assert.equal(result.agentName,'Pip');
 assert.equal(f.ready.length,1,'the app is told to route chat through OpenClaw');assert.match(result.message,/runs on OpenClaw/);
});
test('an existing OpenClaw setup is kept: no onboarding over it and no renaming',async()=>{
 const f=agentFixture({installed:true,configured:true});
 const result=await f.make().prepare(DEFAULT_MODEL,{agentName:'Pip'});
 assert.ok(!f.calls.includes('install'));assert.ok(!f.calls.some(c=>c.startsWith('name:')));
 assert.match(result.message,/existing OpenClaw settings were kept/);
});
test('reopening Foxsocket rechecks OpenClaw without installing, onboarding or sending a chat turn',async()=>{
 const f=agentFixture({installed:true,configured:true});
 const manager=f.make({phase:'ready',model:DEFAULT_MODEL,verified:true,backbone:'openclaw'});
 assert.equal((await manager.status(DEFAULT_MODEL,{agent:true})).ok,true);
 assert.deepEqual(f.calls,['locate','gateway']);
});
test('an explicit connection test sends a real message through OpenClaw, without installing anything',async()=>{
 const f=agentFixture({installed:true,configured:true});const manager=f.make();
 const result=await manager.verify(DEFAULT_MODEL);
 assert.equal(result.phase,'ready');assert.ok(f.calls.includes('chat:agent:main:foxsocket-setup-check'),'a running gateway alone is not proof');
 assert.ok(!f.calls.some(c=>c==='install'||c.startsWith('onboard')));
});
test('testing the direct local route checks only Ollama and never switches chat to OpenClaw',async()=>{
 const f=agentFixture({installed:true,configured:true});const manager=f.make();
 const result=await manager.verify(DEFAULT_MODEL,{agent:false});
 assert.equal(result.phase,'ready');assert.deepEqual(f.calls,[],'OpenClaw is not touched');
 assert.equal(result.backbone,'ollama');assert.equal(f.ready.length,0,'the app is not told to route chat through OpenClaw');
});
test('a kept OpenClaw setup reports the model it really uses, not the one selected here',async()=>{
 const f=agentFixture({installed:true,configured:true,replyModel:'ollama/qwen3:8b'});
 const result=await f.make().prepare(DEFAULT_MODEL);
 assert.equal(result.agentModel,'qwen3:8b');assert.match(result.message,/runs on OpenClaw with qwen3:8b.*kept, so it uses qwen3:8b rather than llama3\.2:3b/);
 const same=agentFixture({installed:true,configured:true});
 assert.doesNotMatch((await same.make().prepare(DEFAULT_MODEL)).message,/rather than/);
});
test('an OpenClaw failure keeps the error for the user and never claims ready',async()=>{
 const f=agentFixture();f.openclaw.install=async()=>{throw Error('OpenClaw needs Node.js, which could not be installed automatically.');};
 const result=await f.make().prepare(DEFAULT_MODEL);
 assert.equal(result.phase,'attention');assert.equal(result.verified,false);assert.match(result.error,/needs Node\.js/);assert.equal(f.ready.length,0);
});
test('an unexpected answer through OpenClaw is reported, but a working install is still ready',async()=>{
 const f=agentFixture({reply:'I cannot do math.'});const result=await f.make().prepare(DEFAULT_MODEL);
 assert.equal(result.phase,'ready');assert.match(result.message,/answer to a basic check was off/);
});

// Rennie's llama.cpp engine in place of Ollama (llama-runtime.cjs provides the real one).
function llamaFixture({built=false,downloaded=false,running=false,scheduleFails=false,verifyFails=null,configured=false}={}){
 const calls=[],state={built,downloaded,running,scheduled:false};
 const engine={kind:'llama',models:[{id:'qwen3.5-4b',label:'Qwen3.5 4B'},{id:'bonsai-2-27b',label:'Ternary Bonsai 2 27B'}],
  needs:()=>({needsBuild:!state.built,needsModel:!state.downloaded,buildBytes:20,unpackedBytes:50,modelBytes:2000}),
  install:async(model,progress)=>{calls.push('install:'+model);progress({phase:'downloading-engine',completed:5,total:20});progress({phase:'downloading-model',completed:10,total:2000});state.built=state.downloaded=true;},
  start:async model=>{calls.push('start:'+model);state.running=true;},running:async()=>state.running,
  schedule:async model=>{calls.push('schedule:'+model);if(scheduleFails)throw Error('Rennie could not set the local model to start when you sign in. It still starts whenever Rennie opens.');state.scheduled=true;},
  verify:async model=>{calls.push('verify:'+model);if(verifyFails)throw Error(verifyFails);return {ok:true,reply:'arithmetic: 12 · instruction: blue'};},
  target:model=>({baseUrl:'http://127.0.0.1:18080/v1',modelId:model,apiKey:'ab'.repeat(32),thinking:model==='bonsai-2-27b'?'medium':null})};
 const targets=[];const f=agentFixture({replyModel:'llama-cpp/qwen3.5-4b',installed:configured,configured});
 f.openclaw.onboard=async({model,target})=>{targets.push(target);f.calls.push('onboard:'+model);return {reused:false};};
 const api=new Proxy({},{get:(_,name)=>()=>{throw Error('Ollama must not be used: '+String(name));}});
 const make=(saved=null)=>createLocalSetup({api,platform:api,engine,defaultModel:'qwen3.5-4b',openclaw:f.openclaw,read:()=>saved,onReady:s=>f.ready.push(s)});
 return {calls,agentCalls:f.calls,targets,state,make,engine};
}
test('with the llama.cpp engine, setup downloads, starts, schedules and verifies it, then points OpenClaw at it, never touching Ollama',async()=>{
 const f=llamaFixture();const manager=f.make();const phases=[];
 const job=manager.prepare('qwen3.5-4b',{agentName:'Pip'});const result=await job;
 assert.equal(manager.get().model,'qwen3.5-4b','the engine’s default model is used');
 assert.deepEqual(f.calls,['install:qwen3.5-4b','start:qwen3.5-4b','schedule:qwen3.5-4b','verify:qwen3.5-4b']);
 assert.deepEqual(f.targets,[{baseUrl:'http://127.0.0.1:18080/v1',modelId:'qwen3.5-4b',apiKey:'ab'.repeat(32),thinking:null}]);
 assert.equal(result.phase,'ready');assert.equal(result.engine,'llama');assert.equal(result.backbone,'openclaw');assert.equal(result.agentModel,'qwen3.5-4b','the provider prefix is removed');
 assert.equal(f.state.scheduled,true);
});
test('a model outside the engine’s list is refused before anything runs',async()=>{
 const f=llamaFixture();assert.throws(()=>f.make().prepare('llama3.2:3b'),/one of the listed local models/);assert.deepEqual(f.calls,[]);
});
test('if the sign-in task cannot be created, setup still finishes and says so',async()=>{
 const f=llamaFixture({scheduleFails:true});const result=await f.make().prepare('qwen3.5-4b');
 assert.equal(result.phase,'ready');assert.match(result.note,/still starts whenever Rennie opens/);
});
test('reopening Rennie restarts the engine without downloading, scheduling or messaging the agent',async()=>{
 const f=llamaFixture({built:true,downloaded:true,running:false,configured:true});
 const manager=f.make({phase:'ready',model:'qwen3.5-4b',engine:'llama',backbone:'openclaw'});
 const status=await manager.status('qwen3.5-4b',{agent:true});
 assert.deepEqual(f.calls,['start:qwen3.5-4b'],'the server is started, the verified model is not asked again');assert.ok(!f.agentCalls.some(c=>c.startsWith('chat:')));
 assert.equal(status.ok,true);assert.equal(status.providerId,'openclaw');
});
test('engine status reports a stopped server or a missing model instead of ready',async()=>{
 const stopped=llamaFixture({built:true,downloaded:true});await stopped.make().prepare('qwen3.5-4b');stopped.state.running=false;
 const manager=stopped.make();
 assert.match((await manager.status('qwen3.5-4b')).error,/verify a real reply|not running/i);
 const missing=llamaFixture({built:true,downloaded:false});
 assert.match((await missing.make().status('qwen3.5-4b')).error,/not downloaded/);
});
test('a failed reply check stops setup at that step with the engine’s own explanation',async()=>{
 const f=llamaFixture({verifyFails:'The local model is installed and running, but it answered the basic arithmetic check incorrectly.'});
 const result=await f.make().prepare('qwen3.5-4b');
 assert.equal(result.phase,'attention');assert.equal(result.failedPhase,'verifying');assert.match(result.error,/arithmetic check incorrectly/);
});
test('a message sent during the quiet reopen check waits for it instead of being refused',async()=>{
 const f=llamaFixture({built:true,downloaded:true,running:false,configured:true});
 const manager=f.make({phase:'ready',model:'qwen3.5-4b',engine:'llama',backbone:'openclaw',reply:'arithmetic: 12'});
 let release;const gate=new Promise(resolve=>release=resolve),start=f.engine.start;f.engine.start=async model=>{await gate;return start(model);};
 const check=manager.status('qwen3.5-4b',{agent:true});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(manager.get().busy,true);assert.equal(manager.get().quiet,true,'chat may wait for this check');
 release();await manager.whenIdle();assert.equal(manager.get().busy,false);assert.equal(manager.get().quiet,false);
 assert.doesNotMatch(manager.get().message,/existing OpenClaw settings/,"Rennie's own configuration is not called existing (Lenovo finding 7)");
 assert.equal((await check).ok,true);
 let resume;const held=new Promise(resolve=>resume=resolve);f.engine.start=async model=>{await held;return start(model);};
 const install=f.make();install.prepare('qwen3.5-4b');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(install.get().busy,true);assert.notEqual(install.get().quiet,true,'a real setup still blocks chat');resume();await install.whenIdle();
});
