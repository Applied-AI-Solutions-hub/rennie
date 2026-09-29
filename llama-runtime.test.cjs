const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {createLlamaRuntime,detect,choose,MODELS,BUILDS,GB}=require('./llama-runtime.cjs');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
// A small catalog with the real structure, so downloads and hashing run on a few bytes.
const files={'engine.zip':'engine bytes','cudart.zip':'cuda runtime','cpu.zip':'cpu engine','small.gguf':'model weights'};
const builds={cuda:{archives:[{file:'engine.zip',bytes:12,sha256:hash('engine bytes')},{file:'cudart.zip',bytes:12,sha256:hash('cuda runtime')}]},cpu:{archives:[{file:'cpu.zip',bytes:10,sha256:hash('cpu engine')}]}};
const made=[];process.on('exit',()=>{for(const dir of made)fs.rmSync(dir,{recursive:true,force:true});});
const models=[{id:'small',label:'Small',build:'cpu',minVideoMemory:0,file:'small.gguf',bytes:13,sha256:hash('model weights')}];
function fixture({serve=files,server={}}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rennie-llama-')),calls=[],spawned=[],killed=new Set();made.push(directory);
  const state={health:null,models:[],key:null,...server};
  const fetchImpl=async(url,options={})=>{
    calls.push(url);
    if(url.endsWith('/health')){if(!state.health)throw Error('refused');return new Response('{}',{status:state.health});}
    if(url.endsWith('/v1/models'))return options.headers?.authorization==='Bearer '+state.key?Response.json({data:state.models.map(id=>({id}))}):new Response('',{status:401});
    const name=url.split('/').pop();if(!(name in serve))return new Response('',{status:404});
    return new Response(serve[name],{status:200,headers:{'content-length':String(Buffer.byteLength(serve[name]))}});
  };
  const executeImpl=async(exe,args)=>{
    calls.push([path.basename(exe),...args]);
    if(path.basename(exe)==='tar.exe'){const dir=args[args.indexOf('-C')+1];fs.writeFileSync(path.join(dir,'llama-server.exe'),'');fs.writeFileSync(path.join(dir,path.basename(args[1])+'.dll'),'');}
    if(exe==='taskkill.exe')killed.add(args[1]);
    if(exe==='tasklist.exe'){const pid=args[1].split(' ').pop();return {stdout:killed.has(pid)?'INFO: No tasks are running which match the specified criteria.':'"llama-server.exe","'+pid+'"'};}
    return {stdout:''};
  };
  const spawnImpl=(exe,args)=>{const child=new EventEmitter();child.pid=4242;child.unref=()=>{};spawned.push({exe,args});
    // The server comes up with this install's key and the requested model.
    setImmediate(()=>{state.health=200;state.key=fs.readFileSync(args[args.indexOf('--api-key-file')+1],'utf8').trim();state.models=[args[args.indexOf('--alias')+1]];});return child;};
  const runtime=createLlamaRuntime({directory,fetchImpl,executeImpl,spawnImpl,platformName:'win32',builds,models,releaseUrl:'https://example.test/release/',urlFor:m=>'https://example.test/models/'+m.file,sleep:()=>new Promise(r=>setImmediate(r)),wait:async()=>{},startTimeoutMs:2000});
  return {directory,runtime,calls,spawned,state};
}

test('the model tier follows the GPU, its driver and its video memory',()=>{
  const nvidia=(mib,driver='616.92')=>({gpu:{name:'NVIDIA GeForce RTX',videoMemory:mib*1024**2,driver},totalMemory:32*GB});
  assert.equal(choose(nvidia(16311)).model,'bonsai-2-27b');
  assert.equal(choose(nvidia(12288)).model,'bonsai-2-27b','a 12 GB card reports 12288 MiB');
  assert.equal(choose(nvidia(8188)).model,'qwen3.5-9b');
  assert.equal(choose(nvidia(4096)).model,'qwen3.5-4b');
  const old=choose(nvidia(16311,'531.18'));assert.equal(old.model,'qwen3.5-4b');assert.equal(old.build,'cpu');assert.match(old.reason,/driver 551\.78 or newer/);
  const none=choose({gpu:null,totalMemory:7.7*GB});assert.equal(none.model,'qwen3.5-4b');assert.equal(none.lowMemory,false,'an 8 GB PC is not flagged');
  assert.equal(choose({gpu:null,totalMemory:6*GB}).lowMemory,true);
});
test('detection reads the largest NVIDIA GPU and treats a missing driver as no GPU',async()=>{
  const two=await detect({totalMemory:16*GB,executeImpl:async()=>({stdout:'NVIDIA T400, 2048, 616.92\r\nNVIDIA GeForce RTX 5060 Ti, 16311, 616.92\r\n'})});
  assert.equal(two.gpu.name,'NVIDIA GeForce RTX 5060 Ti');assert.equal(two.gpu.videoMemory,16311*1024**2);
  assert.equal((await detect({totalMemory:16*GB,executeImpl:async()=>{throw Error('not found');}})).gpu,null);
});
test('the pinned catalog is complete: every model has a build, revision, size and SHA-256',()=>{
  for(const m of MODELS){assert.ok(BUILDS[m.build],m.id);assert.match(m.revision,/^[0-9a-f]{40}$/);assert.match(m.sha256,/^[0-9a-f]{64}$/);assert.ok(m.bytes>1e9);}
  for(const b of Object.values(BUILDS))for(const a of b.archives){assert.match(a.sha256,/^[0-9a-f]{64}$/);assert.ok(a.bytes>1e6);}
  assert.equal(MODELS.at(-1).build,'cpu','the last model is the fallback every PC can run');
});
test('install downloads, verifies and unpacks only what is missing',async()=>{
  const f=fixture();
  assert.deepEqual(f.runtime.needs('small'),{needsBuild:true,needsModel:true,downloadBytes:23,modelBytes:13});
  const phases=[];await f.runtime.install('small',p=>phases.push(p.phase));
  assert.ok(fs.existsSync(path.join(f.directory,'llama','prism-b10743-adfffbe-cpu','llama-server.exe')));
  assert.ok(!fs.existsSync(path.join(f.directory,'downloads','cpu.zip')),'the archive is removed after unpacking');
  assert.ok(phases.includes('downloading-engine')&&phases.includes('downloading-model')&&phases.includes('checking-download'));
  assert.deepEqual(f.runtime.needs('small'),{needsBuild:false,needsModel:false,downloadBytes:0,modelBytes:13});
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
  const first=await f.runtime.start('small');assert.equal(first.started,true);assert.equal(f.spawned.length,1);
  assert.equal(await f.runtime.status('small'),'ours');
  assert.equal((await f.runtime.start('small')).started,false,'a running server is reused');assert.equal(f.spawned.length,1);
});
test('another program on the port is never mistaken for the model server',async()=>{
  const f=fixture({server:{health:200,key:'someone-else',models:['small']}});await f.runtime.install('small');
  assert.equal(await f.runtime.status('small'),'foreign');
  await assert.rejects(f.runtime.start('small'),/Another program is using port 18080/);assert.equal(f.spawned.length,0);
});
test('stop only ends the process it started, and only while it is still llama-server',async()=>{
  const f=fixture();await f.runtime.install('small');await f.runtime.start('small');
  assert.equal(await f.runtime.stop(),true);assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='tasklist.exe').length,2,'it checks that the process has exited');assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]==='taskkill.exe'&&c.includes('4242')));
  assert.equal(await f.runtime.stop(),false,'nothing is stopped without a record of our own process');
});
