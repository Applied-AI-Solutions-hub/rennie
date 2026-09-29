const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createWindowsRuntime,INSTALLER,PUBLISHER}=require('./local-runtime.cjs');
function fixture(){fs.mkdirSync(path.join(__dirname,'.qa'),{recursive:true});const root=fs.mkdtempSync(path.join(__dirname,'.qa','runtime-'));const calls=[];const exe=path.join(root,'Programs','Ollama','ollama.exe');return {root,calls,exe,env:{LOCALAPPDATA:root,ProgramFiles:path.join(root,'programs-other'),SystemRoot:path.join(root,'Windows')},api:{reachable:async()=>false}};}
test('download verifies signature before installing and reports byte progress',async()=>{
 const f=fixture(),progress=[];const runtime=createWindowsRuntime({...f,directory:path.join(f.root,'downloads'),platformName:'win32',fetchImpl:async url=>{assert.equal(url,INSTALLER);return new Response('installer',{headers:{'content-length':'9'}});},executeImpl:async(exe,args,options)=>{f.calls.push({exe,args,options});if(exe==='where.exe')throw Error('missing');if(exe.endsWith('OllamaSetup.exe')){fs.mkdirSync(path.dirname(f.exe),{recursive:true});fs.writeFileSync(f.exe,'fixture');}return {stdout:''};}});
 await runtime.install(p=>progress.push(p));const steps=f.calls.filter(c=>c.exe!=='where.exe');assert.equal(steps.length,2);assert.ok(steps[0].args.includes('-Command'));assert.match(steps[0].args.at(-1),/Get-AuthenticodeSignature/);assert.equal(steps[0].options.env.FOXSOCKET_INSTALLER,path.join(f.root,'downloads','OllamaSetup.exe'));assert.deepEqual(steps[1].args,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-']);assert.ok(progress.some(p=>p.total===9&&p.completed===9));
 assert.equal(steps[0].options.env.FOXSOCKET_PUBLISHER,PUBLISHER,'the exact publisher is pinned, not a substring');
 assert.equal(fs.existsSync(path.join(f.root,'downloads','OllamaSetup.exe')),false,'the 1.5 GB installer is removed after a successful install');
});
test('signature failure prevents executing a downloaded installer and deletes it',async()=>{
 const f=fixture();let executed=false;const runtime=createWindowsRuntime({...f,directory:path.join(f.root,'downloads'),platformName:'win32',fetchImpl:async()=>new Response('installer'),executeImpl:async exe=>{if(exe.endsWith('OllamaSetup.exe'))executed=true;throw Error('invalid signature');}});
 await assert.rejects(runtime.install(()=>{}),/signature/);assert.equal(executed,false);
 assert.equal(fs.existsSync(path.join(f.root,'downloads','OllamaSetup.exe')),false);
});
test('a stalled installer download resumes where it stopped and reports the retry in plain language',async()=>{
 const f=fixture(),progress=[],ranges=[];
 const fetchImpl=async(_,{signal,headers})=>{ranges.push(headers.range||null);
  if(ranges.length===1)return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('inst'));signal.addEventListener('abort',()=>c.error(new Error('aborted')));}}),{headers:{'content-length':'9'}});
  return new Response('aller',{status:206,headers:{'content-range':'bytes 4-8/9'}});};
 const runtime=createWindowsRuntime({...f,directory:path.join(f.root,'downloads'),platformName:'win32',fetchImpl,stallMs:200,wait:async()=>{},executeImpl:async exe=>{if(exe==='where.exe')throw Error('missing');if(exe.endsWith('OllamaSetup.exe')){assert.equal(fs.readFileSync(exe,'utf8'),'installer');fs.mkdirSync(path.dirname(f.exe),{recursive:true});fs.writeFileSync(f.exe,'fixture');}return {stdout:''};}});
 await runtime.install(p=>progress.push(p));
 assert.deepEqual(ranges,[null,'bytes=4-']);assert.ok(progress.some(p=>/Retrying and continuing/.test(p.message)));
});
test('an unrecoverable download explains what to do instead of a generic failure',async()=>{
 const f=fixture();const runtime=createWindowsRuntime({...f,directory:path.join(f.root,'downloads'),platformName:'win32',stallMs:10,wait:async()=>{},fetchImpl:async(_,{signal})=>new Response(new ReadableStream({start(c){signal.addEventListener('abort',()=>c.error(new Error('aborted')));}}))});
 await assert.rejects(runtime.install(()=>{}),/stopped receiving data.*continues where it stopped/);
});
test('already running Ollama is reused without starting another process',async()=>{
 const f=fixture();let spawned=false;const runtime=createWindowsRuntime({...f,directory:f.root,api:{reachable:async()=>true},spawnImpl:()=>{spawned=true;}});await runtime.start();assert.equal(spawned,false);
});
