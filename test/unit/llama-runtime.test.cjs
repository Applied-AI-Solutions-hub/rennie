const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {createLlamaRuntime,detect,choose,executionPlan,MODELS,BUILDS,TASK,GB}=require('../../src/llama-runtime.cjs');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
// A small catalog with the real structure, so downloads and hashing run on a few bytes.
const files={'engine.zip':'engine bytes','cudart.zip':'cuda runtime','cpu.zip':'cpu engine','small.gguf':'model weights'};
const builds={cuda:{archives:[{file:'engine.zip',bytes:12,sha256:hash('engine bytes')},{file:'cudart.zip',bytes:12,sha256:hash('cuda runtime')}]},cpu:{archives:[{file:'cpu.zip',bytes:10,sha256:hash('cpu engine')}]}};
const made=[];process.on('exit',()=>{for(const dir of made)fs.rmSync(dir,{recursive:true,force:true});});
const models=[{id:'small',label:'Small',build:'cpu',minVideoMemory:0,file:'small.gguf',bytes:13,sha256:hash('model weights')}];
// A fake Windows: the server, Task Scheduler and the process list share one state.
function fixture({serve=files,server={},reply=null,ready=true}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rennie llama-')),calls=[],spawned=[],chats=[];made.push(directory);
  const state={health:null,models:[],key:null,running:false,task:null,...server};
  const up=argv=>{state.running=true;state.health=200;state.key=fs.readFileSync(argv[argv.indexOf('--api-key-file')+1],'utf8').trim();state.models=[argv[argv.indexOf('--alias')+1]];};
  const fetchImpl=async(url,options={})=>{
    calls.push(url);
    const authorized=options.headers?.authorization==='Bearer '+state.key;
    if(url.endsWith('/health')){if(!state.health)throw Error('refused');return new Response('{}',{status:state.health});}
    if(url.endsWith('/v1/models'))return authorized?Response.json({data:state.models.map(id=>({id}))}):new Response('',{status:401});
    if(url.endsWith('/v1/chat/completions')){
      if(!authorized)return Response.json({error:{message:'Invalid API Key'}},{status:401});
      const body=JSON.parse(options.body);chats.push(body);const prompt=body.messages.at(-1).content;
      return Response.json({model:state.models[0],choices:[{message:{content:reply??(/7 plus 5/.test(prompt)?'<think>adding</think>12':/blue/.test(prompt)?'blue':'Hello.')}}]});
    }
    const name=url.split('/').pop();if(!(name in serve))return new Response('',{status:404});
    return new Response(serve[name],{status:200,headers:{'content-length':String(Buffer.byteLength(serve[name]))}});
  };
  const executeImpl=async(exe,args,options={})=>{
    const name=path.basename(exe);calls.push([name,...args]);
    if(name==='tar.exe'){const dir=args[args.indexOf('-C')+1];fs.writeFileSync(path.join(dir,'llama-server.exe'),'');fs.writeFileSync(path.join(dir,path.basename(args[1])+'.dll'),'');}
    if(name==='schtasks.exe'){
      if(args[0]==='/Query'&&!state.task)throw Error('The system cannot find the file specified.');
      if(args[0]==='/Run'){state.exe=state.task.server;setImmediate(()=>up(state.task.args));}
      if(args[0]==='/End'){state.running=false;state.health=null;}
    }
    if(name==='powershell.exe'){
      const script=args.at(-1),values=options.env||{};
      if(script.includes('Unregister-ScheduledTask'))state.task=null;
      else if(script.includes('Register-ScheduledTask')){const argv=values.RENNIE_ARGS.match(/"[^"]*"|\S+/g).map(a=>a.replace(/^"|"$/g,''));state.task={exe:values.RENNIE_EXE,line:values.RENNIE_ARGS,server:argv[1],args:argv.slice(2)};}
      else if(values.RENNIE_EXPECTED_EXE)return {stdout:state.running&&state.exe===values.RENNIE_EXPECTED_EXE?'1':'0'};
      else if(script.includes('Get-CimInstance')){assert.equal(values.RENNIE_LLAMA_DIR,path.join(directory,'llama'));const count=state.running?1:0;if(script.includes('Stop-Process')){state.running=false;state.health=null;}return {stdout:count+'\r\n'};}
    }
    return {stdout:''};
  };
  const spawnImpl=(exe,args)=>{const child=new EventEmitter();child.pid=4242;child.unref=()=>{};spawned.push({exe,args});state.exe=exe;state.running=true;if(ready)setImmediate(()=>up(args));return child;};
  const runtime=createLlamaRuntime({directory,fetchImpl,executeImpl,spawnImpl,platformName:'win32',env:{SystemRoot:'C:\\Windows'},builds,models,releaseUrl:'https://example.test/release/',urlFor:m=>'https://example.test/models/'+m.file,sleep:()=>new Promise(r=>setImmediate(r)),wait:async()=>{},startTimeoutMs:2000});
  return {directory,runtime,calls,spawned,chats,state};
}

test('the model tier follows the GPU, its driver and its video memory',()=>{
  const nvidia=(mib,driver='616.92')=>({gpu:{name:'NVIDIA GeForce RTX',videoMemory:mib*1024**2,driver},totalMemory:32*GB});
  assert.equal(choose(nvidia(16311)).model,'qwen3.5-4b');
  assert.equal(choose(nvidia(12288)).build,'cuda');
  assert.equal(choose(nvidia(8188)).build,'cuda');
  assert.equal(choose(nvidia(6144)).model,'qwen3.5-4b','a 6 GB card is below the 9B model’s measured 6,191 MiB');
  assert.equal(choose(nvidia(4096)).model,'qwen3.5-4b');
  const old=choose(nvidia(16311,'531.18'));assert.equal(old.model,'qwen3.5-4b');assert.equal(old.build,'cpu');assert.match(old.reason,/driver 551\.78 or newer/);
  const none=choose({gpu:null,totalMemory:7.7*GB});assert.equal(none.model,'qwen3.5-4b');assert.equal(none.lowMemory,false,'an 8 GB PC is not flagged');
  assert.equal(choose({gpu:null,totalMemory:6*GB}).lowMemory,true);
});
test('backend selection follows the selected model and hardware, independently of recommendation',()=>{
  const pc={gpu:{name:'NVIDIA',driver:'616.92',videoMemory:16*GB},totalMemory:32*GB};
  for(const model of MODELS)assert.equal(executionPlan(model,pc).build,'cuda');
  assert.equal(executionPlan(MODELS[2],{...pc,gpu:{...pc.gpu,videoMemory:6*GB}}).build,'cuda');
  const small=executionPlan(MODELS[2],{...pc,gpu:{...pc.gpu,videoMemory:4*GB}});
  assert.equal(small.build,'cpu');assert.match(small.reason,/video memory/);
  assert.equal(executionPlan(MODELS[0],{gpu:null,totalMemory:8*GB}).fits,false);
  assert.equal(choose({gpu:null,totalMemory:64*GB}).model,'qwen3.5-4b','more RAM alone never upsizes the default');
});

test('switching the same model CPU to CUDA and back preserves weights and key and refreshes the task',async()=>{
  const f=fixture();await f.runtime.install('small');await f.runtime.start('small');await f.runtime.schedule('small');
  const key=f.runtime.key(),before=f.calls.filter(c=>typeof c==='string'&&c.endsWith('small.gguf')).length;
  for(const build of ['cuda','cpu']){
    await f.runtime.configure('small',{build});await f.runtime.install('small');
    assert.equal((await f.runtime.start('small')).started,true);
    assert.equal(f.state.task.server,f.runtime.paths.server(build));
    assert.equal(f.state.task.args.includes('-ngl'),build==='cuda');
    assert.equal((await f.runtime.start('small')).started,false,'matching backend is reused');
    assert.equal(f.runtime.key(),key);
  }
  assert.equal(f.calls.filter(c=>typeof c==='string'&&c.endsWith('small.gguf')).length,before);
});

test('a missing replacement backend leaves the working server running',async()=>{
  const f=fixture();await f.runtime.install('small');await f.runtime.start('small');
  await f.runtime.configure('small',{build:'cuda'});
  await assert.rejects(f.runtime.start('small'),/not set up yet/);
  assert.equal(f.state.running,true);assert.equal(f.state.exe,f.runtime.paths.server('cpu'));
});
test('quiet reopen never replaces a running backend even when the saved choice differs',async()=>{
  const f=fixture();await f.runtime.install('small');await f.runtime.start('small');
  await f.runtime.configure('small',{build:'cuda'});await f.runtime.install('small');
  await assert.rejects(f.runtime.start('small',{allowBackendSwitch:false}),/running model was kept/);
  assert.equal(f.state.exe,f.runtime.paths.server('cpu'));assert.equal(f.state.running,true);
});
test('detection reads the largest NVIDIA GPU and treats a missing driver as no GPU',async()=>{
  const two=await detect({totalMemory:16*GB,executeImpl:async()=>({stdout:'NVIDIA T400, 2048, 616.92\r\nNVIDIA GeForce RTX 5060 Ti, 16311, 616.92\r\n'})});
  assert.equal(two.gpu.name,'NVIDIA GeForce RTX 5060 Ti');assert.equal(two.gpu.videoMemory,16311*1024**2);
  assert.equal((await detect({totalMemory:16*GB,executeImpl:async()=>{throw Error('not found');}})).gpu,null);
});
test('the pinned catalog is complete: every model has a build, revision, size, SHA-256 and setup-page text',()=>{
  for(const m of MODELS){assert.ok(BUILDS[m.build],m.id);assert.match(m.revision,/^[0-9a-f]{40}$/);assert.match(m.sha256,/^[0-9a-f]{64}$/);assert.ok(m.bytes>1e9);assert.ok(m.download&&m.memory,m.id);}
  for(const b of Object.values(BUILDS)){assert.ok(b.unpackedBytes>1e6);for(const a of b.archives){assert.match(a.sha256,/^[0-9a-f]{64}$/);assert.ok(a.bytes>1e6);}}
  assert.equal(MODELS.at(-1).build,'cpu','the last model is the fallback every PC can run');
});
test('install downloads, verifies and unpacks only what is missing',async()=>{
  const f=fixture();
  assert.deepEqual(f.runtime.needs('small'),{needsBuild:true,needsModel:true,downloadBytes:23,modelBytes:13,buildBytes:10,unpackedBytes:0});
  const phases=[];await f.runtime.install('small',p=>phases.push(p.phase));
  assert.ok(fs.existsSync(path.join(f.directory,'llama','prism-b10743-adfffbe-cpu','llama-server.exe')));
  assert.ok(!fs.existsSync(path.join(f.directory,'downloads','cpu.zip')),'the archive is removed after unpacking');
  assert.ok(phases.includes('downloading-engine')&&phases.includes('unpacking-engine')&&phases.includes('downloading-model'));
  assert.deepEqual(f.runtime.needs('small'),{needsBuild:false,needsModel:false,downloadBytes:0,modelBytes:13,buildBytes:10,unpackedBytes:0});
  const before=f.calls.length;await f.runtime.install('small');assert.equal(f.calls.length,before,'nothing is fetched or unpacked again');
});
test('a download that does not match its checksum is deleted and never used',async()=>{
  const f=fixture({serve:{...files,'small.gguf':'tampered bits!'.slice(0,13)}});
  await assert.rejects(f.runtime.install('small'),/did not match its published checksum/);
  assert.ok(!fs.existsSync(path.join(f.directory,'models','small.gguf')));
  assert.equal(f.runtime.needs('small').needsModel,true);
});
test('a complete model already on disk is hashed once instead of downloaded again',async()=>{
  const f=fixture();fs.mkdirSync(path.join(f.directory,'models'),{recursive:true});fs.writeFileSync(path.join(f.directory,'models','small.gguf'),'model weights');
  await f.runtime.install('small');assert.ok(!f.calls.some(c=>typeof c==='string'&&c.endsWith('small.gguf')));
});
test('a server that is gone or unreachable reports a plain instruction',async()=>{
  const f=fixture({serve:{}});await assert.rejects(f.runtime.install('small'),/download link was refused by the server/);
  await assert.rejects(f.runtime.start('small'),/not set up yet/);
});
test('the server listens only on loopback, reads its key from a file and gets GPU layers only on the CUDA build',()=>{
  const f=fixture(),a=f.runtime.args('small');
  assert.equal(a[a.indexOf('--host')+1],'127.0.0.1');assert.ok(a.includes('--api-key-file'));assert.ok(!a.includes('--api-key'));assert.ok(a.includes('--no-webui'));assert.ok(!a.includes('-ngl'));
  const k=f.runtime.key();assert.match(k,/^[0-9a-f]{64}$/);assert.equal(f.runtime.key(),k,'the key is created once per install');
  const gpu=createLlamaRuntime({directory:f.directory,models:[{...models[0],build:'cuda'}],builds}).args('small');assert.equal(gpu[gpu.indexOf('-ngl')+1],'99');
});
test('start runs the server once and confirms it is ours by key and model',async()=>{
  const f=fixture();await f.runtime.install('small');
  assert.equal((await f.runtime.start('small')).started,true);assert.equal(f.spawned.length,1);
  assert.equal(await f.runtime.status('small'),'ours');
  assert.equal((await f.runtime.start('small')).started,false,'a running server is reused');assert.equal(f.spawned.length,1);
});
test('another program on the port is never mistaken for the model server',async()=>{
  const f=fixture({server:{health:200,key:'someone-else',models:['small']}});await f.runtime.install('small');
  assert.equal(await f.runtime.status('small'),'foreign');
  await assert.rejects(f.runtime.start('small'),/Another program is using port 18080/);assert.equal(f.spawned.length,0);
});
test('the sign-in task runs the server headless, with the key file and never the key itself',async()=>{
  const f=fixture();await f.runtime.install('small');const key=f.runtime.key();
  assert.equal(await f.runtime.scheduled(),false);
  await f.runtime.schedule('small');
  assert.equal(path.basename(f.state.task.exe),'conhost.exe');assert.match(f.state.task.line,/^--headless /);
  assert.deepEqual(f.state.task.args,f.runtime.args('small'),'the task runs exactly the server arguments');
  assert.ok(!f.state.task.line.includes(key));
  const register=f.calls.find(c=>c[0]==='powershell.exe'&&c.at(-1).includes('Register-ScheduledTask')).at(-1);
  assert.match(register,/-AtLogOn/);assert.match(register,/-RunLevel Limited/);assert.doesNotMatch(register,/RestartCount/,'a server Rennie stopped is not restarted behind its back');
  assert.equal(await f.runtime.scheduled(),true);
  assert.equal(await f.runtime.unschedule(),true);assert.equal(await f.runtime.scheduled(),false);
});
test('with a sign-in task, start refreshes and runs the task instead of starting a second copy',async()=>{
  const f=fixture();await f.runtime.install('small');await f.runtime.schedule('small');
  assert.equal((await f.runtime.start('small')).started,true);
  assert.equal(f.spawned.length,0);assert.ok(f.calls.some(c=>c[0]==='schtasks.exe'&&c[1]==='/Run'));
  assert.equal(await f.runtime.status('small'),'ours');
});
test('stop ends only servers running from this install’s folder and waits for them',async()=>{
  const f=fixture();await f.runtime.install('small');await f.runtime.start('small');
  assert.equal(await f.runtime.stop(),true);assert.equal(await f.runtime.status('small'),'down');
  assert.equal(await f.runtime.stop(),false,'nothing of ours was running');
});
test('the reply check sends both checks deterministically, with thinking off, and strips thinking from replies',async()=>{
  const f=fixture();await f.runtime.install('small');await f.runtime.start('small');
  const result=await f.runtime.verify('small');
  assert.deepEqual(result.checks.map(c=>c.reply),['12','blue']);
  assert.ok(f.chats.every(c=>c.temperature===0&&c.seed===42&&c.chat_template_kwargs.enable_thinking===false&&c.model==='small'));
});
test('a wrong answer or a rejected key is reported, never counted as ready',async()=>{
  const wrong=fixture({reply:'13'});await wrong.runtime.install('small');await wrong.runtime.start('small');
  await assert.rejects(wrong.runtime.verify('small'),/answered the basic arithmetic check incorrectly/);
  const f=fixture();await f.runtime.install('small');await f.runtime.start('small');f.state.key='rotated';
  await assert.rejects(f.runtime.complete('small',[{role:'user',content:'hi'}]),/rejected this install’s key/);
});
test('checking or chatting before setup never creates a key or any file',async()=>{
  const f=fixture({server:{health:200,key:'someone-else',models:['small']}});
  assert.equal(await f.runtime.status('small'),'foreign','with no key of ours, a server on the port is not ours');
  await assert.rejects(f.runtime.complete('small',[{role:'user',content:'hi'}]),/not set up yet/);
  assert.deepEqual(fs.readdirSync(f.directory),[],'nothing was written');
});
test('a server that never becomes ready is stopped, not left running',async()=>{
  const f=fixture({ready:false});await f.runtime.install('small');
  await assert.rejects(f.runtime.start('small'),/did not become ready/);
  assert.ok(f.calls.some(c=>c[0]==='powershell.exe'&&c.at(-1).includes('Stop-Process')),'the started process is ended');
  assert.equal(f.state.running,false);
});
