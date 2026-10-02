const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createOpenClaw,runProcess,VERSION,INSTALL_SCRIPT}=require('../../src/openclaw-native.cjs');
const sha256=text=>require('node:crypto').createHash('sha256').update(text).digest('hex');
// A disposable npm-style install: <root>\npm\openclaw.cmd + node_modules\openclaw,
// with node.exe elsewhere. Only the registry PATH knows about it, as happens
// right after OpenClaw's installer runs while Rennie is already open.
function layout({configured=false}={}){
 fs.mkdirSync(path.join(__dirname,'..','..','.qa'),{recursive:true});const root=fs.mkdtempSync(path.join(__dirname,'..','..','.qa','openclaw-'));
 const npm=path.join(root,'npm'),pkg=path.join(npm,'node_modules','openclaw'),nodeDir=path.join(root,'nodejs'),home=path.join(root,'home');
 fs.mkdirSync(pkg,{recursive:true});fs.mkdirSync(nodeDir);fs.mkdirSync(path.join(home,'.openclaw'),{recursive:true});
 fs.writeFileSync(path.join(npm,'openclaw.cmd'),'@echo off');fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'openclaw',bin:{openclaw:'openclaw.mjs'}}));
 fs.writeFileSync(path.join(pkg,'openclaw.mjs'),'');fs.writeFileSync(path.join(nodeDir,'node.exe'),'');
 if(configured)fs.writeFileSync(path.join(home,'.openclaw','openclaw.json'),'{}');
 return {root,home,node:path.join(nodeDir,'node.exe'),entry:path.join(pkg,'openclaw.mjs'),env:{PATH:'C:\\Windows\\System32',FAKEROOT:root,SystemRoot:'C:\\Windows',APPDATA:path.join(root,'appdata')}};
}
function fake(l,handlers={},clock={now:()=>0,wait:async()=>{}}){
 const calls=[];
 const run=async(exe,args,options={})=>{calls.push({exe,args,options});
  if(exe==='reg.exe')return {code:0,stdout:args[1].startsWith('HKCU')?'    Path    REG_EXPAND_SZ    %FAKEROOT%\\npm;%FAKEROOT%\\nodejs\r\n':'',stderr:''};
  const cmd=args.slice(1).join(' ');for(const [pattern,reply] of Object.entries(handlers))if(cmd.includes(pattern))return typeof reply==='function'?reply(args,options):reply;
  return {code:0,stdout:'',stderr:''};};
 const claw=createOpenClaw({directory:path.join(l.root,'work'),env:l.env,run,home:l.home,platformName:'win32',...clock});
 return {claw,calls,cliCalls:()=>calls.filter(c=>c.exe===l.node)};
}
test('a fresh install is found through the registry PATH and run directly with node.exe, never cmd.exe',async()=>{
 const l=layout();const f=fake(l,{'agents list':{code:0,stdout:'[{"id":"main","identityName":"Pip"},{"id":"bad id!"}]'}});
 assert.deepEqual(await f.claw.agents(),[{id:'main',name:'Pip'}],'agent ids are validated by the shared parser');
 const call=f.cliCalls()[0];assert.equal(call.exe,l.node);assert.equal(call.args[0],l.entry);assert.ok(!f.calls.some(c=>/cmd(\.exe)?$/i.test(c.exe)));
 assert.ok(call.options.env.PATH.includes(path.join(l.root,'npm')),'OpenClaw sees the refreshed PATH too');
 const registryReads=f.calls.filter(c=>c.exe==='reg.exe').length;await f.claw.agents();await f.claw.locate();
 assert.equal(f.calls.filter(c=>c.exe==='reg.exe').length,registryReads,'the location is looked up once, not on every call');
});
test('the gateway check is reused for a while; setup, repair and failed chats force a fresh one',async()=>{
 const l=layout();let up=0;const f=fake(l,{'gateway status':()=>({code:up}),'doctor --fix':{code:0},'doctor --json':{code:0,stdout:'{"ok":true}'},'agent --session-key':{code:1,stdout:''}});
 const probes=()=>f.cliCalls().filter(c=>c.args.includes('status')).length;
 assert.equal(await f.claw.gatewayRunning(),true);await f.claw.gatewayRunning();await Promise.all([f.claw.gatewayRunning(),f.claw.gatewayRunning()]);
 assert.equal(probes(),1,'the 30-second UI refresh does not start a process each time');
 up=1;await f.claw.startGateway().catch(()=>{});assert.ok(probes()>1,'setup always checks for real');
 const before=probes();await f.claw.chat({message:'hi',session:'agent:main:x'}).catch(()=>{});up=0;await f.claw.gatewayRunning();
 assert.equal(probes(),before+1,'a failed chat makes the next check real');
});
test('chat text travels in a file, never on the command line, and the file is removed afterwards',async()=>{
 const l=layout();let seen;
 const f=fake(l,{'agent --session-key':args=>{const file=args[args.indexOf('--message-file')+1];seen={file,text:fs.readFileSync(file,'utf8')};return {code:0,stdout:JSON.stringify({ok:true,status:'ok',final:'The answer is 12.',model:'llama3.2:3b',provider:'ollama'})};}});
 const message='hello" & del /q C:\\ & $(calc) %PATH%';
 const reply=await f.claw.chat({message,session:'agent:main:command-center-1'});
 assert.equal(reply.content,'The answer is 12.');assert.equal(reply.provider,'ollama');assert.equal(seen.text,message);
 assert.ok(!f.cliCalls().some(c=>c.args.join(' ').includes('del /q')),'the message never appears in argv');
 assert.equal(fs.existsSync(seen.file),false);
 await assert.rejects(f.claw.chat({message:'x',session:'main; rm -rf'}),/invalid session/);
});
test('cold local replies get thirty minutes and the process deadline leaves shutdown grace',async()=>{
 const l=layout();const f=fake(l,{'agent --session-key':{code:0,stdout:'{"ok":true,"status":"ok","final":"blue"}'}});
 for(const timeoutSeconds of [undefined,30]){
  await f.claw.chat({message:'Reply with only the word blue.',session:'agent:main:cold-test',...(timeoutSeconds===undefined?{}:{timeoutSeconds})});
  const call=f.cliCalls().at(-1),seconds=timeoutSeconds??1800;
  assert.equal(call.args[call.args.indexOf('--timeout')+1],String(seconds));
  assert.equal(call.options.timeout,(seconds+60)*1000);
  assert.equal(fs.readdirSync(path.join(l.root,'work','messages')).length,0);
 }
});

test('real OpenClaw 2026.9.3 replies are read, via the gateway and with --local (captured 2026-09-28, ids scrubbed)',async()=>{
 const l=layout();
 const meta={durationMs:12724,agentMeta:{sessionId:'00000000-0000-0000-0000-000000000000',provider:'llama-cpp',model:'bonsai-8b',contextTokens:32768,usage:{input:16377,output:10,cacheRead:7570}}};
 const gateway={runId:'00000000-0000-0000-0000-000000000001',status:'ok',summary:'completed',result:{payloads:[{text:'7 plus 5 is 12.',mediaUrl:null}],meta}};
 const local={payloads:[{text:'7 plus 5 is 12.',mediaUrl:null}],meta};
 for(const shape of [gateway,local]){
  const f=fake(l,{'agent --session-key':{code:0,stdout:JSON.stringify(shape,null,2)}});
  assert.deepEqual(await f.claw.chat({message:'x',session:'agent:main:x'}),{content:'7 plus 5 is 12.',model:'bonsai-8b',provider:'llama-cpp'});
 }
 const failed=fake(l,{'agent --session-key':{code:1,stdout:JSON.stringify({runId:'r',status:'error',summary:'failed',result:{payloads:[],meta}})}});
 await assert.rejects(failed.claw.chat({message:'x',session:'agent:main:x'}),/could not complete the reply/);
});
test('a reply refused with HTTP 401 is tried again once, then the error is shown',async()=>{
 const l=layout();const refused={code:1,stdout:JSON.stringify({ok:false,status:'error',error:{message:'Authentication failed (provider returned HTTP 401). Your provider token may have expired.'}})};
 let answers=[refused,{code:0,stdout:'{"ok":true,"status":"ok","final":"blue"}'}];const f=fake(l,{'agent --session-key':()=>answers.shift()});
 assert.equal((await f.claw.chat({message:'x',session:'agent:main:x'})).content,'blue');
 assert.equal(f.cliCalls().filter(c=>c.args.includes('--session-key')).length,2);assert.ok(f.claw.log().some(line=>/HTTP 401/.test(line)),'the retry is noted in the setup log');
 answers=[refused,refused];const g=fake(l,{'agent --session-key':()=>answers.shift()});
 await assert.rejects(g.claw.chat({message:'x',session:'agent:main:x'}),/HTTP 401/);assert.equal(g.cliCalls().filter(c=>c.args.includes('--session-key')).length,2,'only one retry');
 const other=fake(l,{'agent --session-key':{code:1,stdout:JSON.stringify({ok:false,status:'error',error:{message:'model not found'}})}});
 await assert.rejects(other.claw.chat({message:'x',session:'agent:main:x'}),/model not found/);assert.equal(other.cliCalls().filter(c=>c.args.includes('--session-key')).length,1,'other errors are not retried');
});
test('authentication retries share the original deadline, including the retry delay',async()=>{
 const l=layout();let time=0,attempt=0;
 const refused={code:1,stdout:JSON.stringify({ok:false,status:'error',error:{message:'HTTP 401'}})};
 const f=fake(l,{'agent --session-key':()=>{if(++attempt===1){time+=40000;return refused;}return {code:0,stdout:'{"ok":true,"status":"ok","final":"blue"}'};}},{now:()=>time,wait:async ms=>{time+=ms;}});
 assert.equal((await f.claw.chat({message:'x',session:'agent:main:x',timeoutSeconds:90})).content,'blue');
 const calls=f.cliCalls().filter(c=>c.args.includes('--session-key'));
 assert.deepEqual(calls.map(c=>c.args[c.args.indexOf('--timeout')+1]),['90','35']);
 assert.equal(calls[1].options.timeout,95000,'remaining reply time plus one CLI shutdown grace');
 assert.equal(fs.readdirSync(path.join(l.root,'work','messages')).length,0);
});

test('an exhausted reply budget does not retry or accept a timed-out partial result',async()=>{
 const l=layout();let time=0,waited=false;
 const f=fake(l,{'agent --session-key':()=>{time=80000;return {code:1,stdout:JSON.stringify({ok:false,status:'error',error:{message:'HTTP 401'}})};}},{now:()=>time,wait:async()=>{waited=true;}});
 await assert.rejects(f.claw.chat({message:'x',session:'agent:main:x',timeoutSeconds:90}),/did not reply in time/);
 assert.equal(waited,false);assert.equal(f.cliCalls().filter(c=>c.args.includes('--session-key')).length,1);
 const g=fake(l,{'agent --session-key':{code:null,timedOut:true,stdout:'{"ok":true,"status":"ok","final":"partial"}'}});
 await assert.rejects(g.claw.chat({message:'x',session:'agent:main:x'}),/did not reply in time/);
 assert.equal(fs.readdirSync(path.join(l.root,'work','messages')).length,0);
});

test('agent failures surface OpenClaw’s own explanation instead of a generic error',async()=>{
 const l=layout();
 const f=fake(l,{'agent --session-key':{code:1,stdout:JSON.stringify({ok:false,status:'error',error:{message:'model llama3.2:3b not found',kind:'model'}})}});
 await assert.rejects(f.claw.chat({message:'hi',session:'agent:main:x'}),/model llama3\.2:3b not found/);
 const g=fake(l,{'agent --session-key':{code:1,stdout:'',timedOut:true}});
 await assert.rejects(g.claw.chat({message:'hi',session:'agent:main:x'}),/did not reply in time/);
});
test('onboarding configures local Ollama with a loopback gateway service and no secrets',async()=>{
 const l=layout();const f=fake(l);
 assert.deepEqual(await f.claw.onboard({model:'llama3.2:3b'}),{reused:false});
 assert.ok(f.cliCalls().some(c=>c.args.slice(1).join(' ')==='config set agents.defaults.experimental.localModelLean true'),'lean mode is turned on for a configuration Rennie created');
 const args=f.cliCalls().find(c=>c.args[1]==='onboard').args;
 for(const flag of ['--non-interactive','--accept-risk','--install-daemon','--skip-channels','--skip-skills'])assert.ok(args.includes(flag),flag);
 assert.equal(args[args.indexOf('--auth-choice')+1],'ollama');assert.equal(args[args.indexOf('--custom-model-id')+1],'llama3.2:3b');
 assert.equal(args[args.indexOf('--custom-base-url')+1],'http://127.0.0.1:11434');assert.equal(args[args.indexOf('--gateway-bind')+1],'loopback');
 assert.ok(!args.some(a=>/api-key|token|password/i.test(a)&&!/suppress-gateway-token-output/.test(a)),'no credentials are passed');
 await assert.rejects(f.claw.onboard({model:'bad model; rm'}),/valid local model/);
});
test('onboarding to Rennie’s llama.cpp server adds the pinned connector and passes the key only through the environment',async()=>{
 const l=layout();const f=fake(l);const key='ab'.repeat(32);
 const target={baseUrl:'http://127.0.0.1:18080/v1',modelId:'bonsai-2-27b',apiKey:key,thinking:'medium'};
 assert.deepEqual(await f.claw.onboard({model:'bonsai-2-27b',target}),{reused:false});
 const cli=f.cliCalls().map(c=>c.args.slice(1));
 assert.deepEqual(cli[0],['plugins','install','@openclaw/llama-cpp-provider@'+VERSION],'the connector is added first, pinned to the OpenClaw version');
 const onboard=f.cliCalls().find(c=>c.args[1]==='onboard');const args=onboard.args;
 assert.equal(args[args.indexOf('--auth-choice')+1],'llama-cpp-existing-server');assert.equal(args[args.indexOf('--custom-base-url')+1],'http://127.0.0.1:18080/v1');
 assert.equal(args[args.indexOf('--custom-model-id')+1],'bonsai-2-27b');assert.equal(args[args.indexOf('--gateway-bind')+1],'loopback');
 assert.ok(!f.calls.some(c=>c.args.join(' ').includes(key)),'the key never appears in any command line');
 assert.equal(onboard.options.env.LLAMA_SERVER_API_KEY,key);assert.ok(!f.cliCalls().filter(c=>c!==onboard).some(c=>c.options.env?.LLAMA_SERVER_API_KEY),'only onboarding receives the key');
 assert.ok(cli.some(a=>a.join(' ')==='config set agents.defaults.experimental.localModelLean true'));assert.ok(cli.some(a=>a.join(' ')==='config set agents.defaults.thinkingDefault medium'));
 for(const bad of [{...target,baseUrl:'http://192.0.2.1:18080/v1'},{...target,apiKey:'short'},{...target,modelId:'a b'},{...target,thinking:'max'}])await assert.rejects(fake(layout()).claw.onboard({model:'x',target:bad}),/not valid/);
 const failed=fake(layout(),{'plugins install':{code:1,stdout:'',stderr:'npm error network'}});
 await assert.rejects(failed.claw.onboard({model:'x',target}),/could not add its llama\.cpp connector/);assert.ok(!failed.cliCalls().some(c=>c.args[1]==='onboard'));
});
test('after setup the gateway is restarted, so it loads the connector and the saved key',async()=>{
 const l=layout();const f=fake(l);await f.claw.restartGateway();
 assert.deepEqual(f.cliCalls().map(c=>c.args.slice(1).join(' ')),['gateway restart']);
 const failing=fake(layout(),{'gateway restart':{code:1,stdout:'',stderr:'no service'}});await failing.claw.restartGateway();
});
test('an existing OpenClaw configuration is reused and never re-onboarded',async()=>{
 const l=layout({configured:true});const f=fake(l);
 assert.deepEqual(await f.claw.onboard({model:'llama3.2:3b'}),{reused:true});assert.equal(f.cliCalls().length,0);
});
test('the assistant name is validated and saved as the OpenClaw identity of the main agent',async()=>{
 const l=layout();const f=fake(l);
 await f.claw.setName('Pip Juniper');const args=f.cliCalls()[0].args;
 assert.deepEqual(args.slice(1,6),['agents','set-identity','--agent','main','--name']);assert.equal(args[6],'Pip Juniper');
 for(const bad of ['','x'.repeat(41),'<script>','"quoted"'])await assert.rejects(f.claw.setName(bad),/letters, numbers/);
});
test('the installer comes from a pinned OpenClaw commit and is never run unless its SHA-256 matches',async()=>{
 assert.match(INSTALL_SCRIPT,/^https:\/\/raw\.githubusercontent\.com\/openclaw\/openclaw\/[0-9a-f]{40}\/scripts\/install\.ps1$/,'a commit URL, not the moving openclaw.ai copy');
 const l=layout();const ran=[];
 const claw=createOpenClaw({directory:path.join(l.root,'work'),env:l.env,home:l.home,platformName:'win32',wait:async()=>{},fetchImpl:async()=>new Response('# tampered installer'),run:async(exe,args)=>{ran.push(exe);return {code:0,stdout:''};}});
 await assert.rejects(claw.install(()=>{}),/did not match the reviewed version.*deleted without running/);
 assert.ok(!ran.some(exe=>/powershell/i.test(exe)),'PowerShell never runs a script that fails the check');
 assert.equal(fs.existsSync(path.join(l.root,'work','openclaw-install.ps1')),false);
});
test('installer failures are explained in plain language from the installer output',async()=>{
 const l=layout();
 const cases=[['[!] Portable Node.js bootstrap failed\nError: Could not install Node.js automatically.',/needs Node\.js/],['Cannot set property. Property setting is supported only on core types in this language mode. ConstrainedLanguage',/security policy blocked/],['npm error code ENOSPC',/disk is full/],['getaddrinfo ENOTFOUND registry.npmjs.org',/lost its internet connection/]];
 for(const [output,pattern] of cases){
  const calls=[];
  const claw=createOpenClaw({directory:path.join(l.root,'work'),env:l.env,home:l.home,platformName:'win32',wait:async()=>{},installSha256:sha256('# installer'),fetchImpl:async url=>{assert.equal(url,INSTALL_SCRIPT);return new Response('# installer');},
   run:async(exe,args,options)=>{calls.push(args);if(exe==='reg.exe')return {code:0,stdout:''};for(const line of output.split('\n'))options.onLine?.(line);return {code:1,stdout:output,stderr:''};}});
  await assert.rejects(claw.install(()=>{}),pattern);
  const ps=calls.find(a=>a.includes('-File'));assert.deepEqual(ps.slice(-3),['-Tag',VERSION,'-NoOnboard'],'the version is pinned and onboarding is left to Rennie');
  assert.ok(claw.log().length>0,'installer output is kept for Technical details');
 }
});
test('the gateway is only started when not already running, and a missing task is reinstalled',async()=>{
 const l=layout();
 const running=fake(l,{'gateway status':{code:0,stdout:'{}'}});await running.claw.startGateway();
 assert.ok(!running.cliCalls().some(c=>c.args.includes('start')));
 let status=1;const f=fake(l,{'gateway status':()=>({code:status,stdout:''}),'gateway start':()=>({code:f.cliCalls().some(c=>c.args.includes('install'))?(status=0,0):1}),'gateway install':{code:0}});
 await f.claw.startGateway();assert.deepEqual(f.cliCalls().map(c=>c.args[2]).filter(a=>a!=='status'),['start','install','start']);
});
test('doctor findings are bounded and reduced to the fields Rennie shows',async()=>{
 const l=layout();const f=fake(l,{'doctor --json':{code:0,stdout:JSON.stringify({ok:false,checksRun:31,checksSkipped:29,findings:[{checkId:'core/doctor/security',severity:'warning',message:'plaintext secret',fixHint:'Run openclaw secrets configure',path:'models.providers.x.apiKey',extra:'dropped'}]})}});
 const report=await f.claw.doctor();assert.equal(report.ok,false);assert.equal(report.checksRun,31);
 assert.deepEqual(Object.keys(report.findings[0]).sort(),['checkId','fixHint','message','severity','target']);
});
test('the real process runner streams lines and enforces its timeout',async()=>{
 const lines=[];const r=await runProcess(process.execPath,['-e','console.log("one");console.error("two")'],{onLine:l=>lines.push(l)});
 assert.equal(r.code,0);assert.deepEqual(lines.sort(),['one','two']);
 const slow=await runProcess(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeout:200});assert.equal(slow.timedOut,true);
});

test('native cancellation targets the current session through the gateway',async()=>{
 const f=fake(layout(),{'agent:main:test':{code:0,stdout:'{"ok":true,"aborted":true}'}});
 assert.equal((await f.claw.cancelChat('agent:main:test')).aborted,true);
 const a=f.cliCalls()[0].args;assert.equal(path.basename(a[0]),'openclaw-cancel.mjs');assert.equal(a[2],'agent:main:test');
 await assert.rejects(f.claw.cancelChat('wrong;session'),/Invalid/);
});
test('native config changes use a temporary patch file and remove it after a failed validation',async()=>{
 let file;const f=fake(layout(),{'config patch':args=>{file=args[args.indexOf('--file')+1];assert.deepEqual(JSON.parse(fs.readFileSync(file)),{skills:{entries:{research:{enabled:false}}}});return {code:1,stdout:'invalid'};}});
 await assert.rejects(f.claw.configPatch({skills:{entries:{research:{enabled:false}}}}),/did not accept/);assert.equal(fs.existsSync(file),false);
});

test('confirmed native cancellation is reported as stopped rather than a timeout',async()=>{
 let finish;let entered;const started=new Promise(r=>entered=r);
 const f=fake(layout(),{'agent --session-key':()=>{entered();return new Promise(r=>finish=r);},'agent:main:cancelled':()=>{finish({code:1,stdout:'{"status":"timeout"}'});return {code:0,stdout:'{"ok":true,"aborted":true}'};}});
 const chat=f.claw.chat({message:'Wait',session:'agent:main:cancelled'});await started;await f.claw.cancelChat('agent:main:cancelled');await assert.rejects(chat,/Reply stopped/);
});

test('explicit restart never reports success when the native restart command fails',async()=>{
 const f=fake(layout(),{'gateway restart':{code:1,stdout:'',stderr:'service unavailable'}});
 await assert.rejects(f.claw.restartGateway({required:true}),/could not confirm the restart/);
});
