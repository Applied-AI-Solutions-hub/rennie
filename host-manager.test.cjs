const {test}=require('node:test'),assert=require('node:assert/strict');
const {createManager,clawArgs}=require('./host-manager');
function fixture(changes={}){
 const flags={runtime:true,configured:true,systemd:true,service:true,running:true,restart:true,enabled:true,linger:true,boot:true,reachable:true,...changes},calls=[],events=[];
 const execute=async(exe,args)=>{calls.push(args);const ok=output=>({ok:true,output}),fail=()=>({ok:false,output:''});
  if(args.includes('--version'))return flags.runtime?ok('OpenClaw 2026.9.3'):fail();
  if(args.includes('ps'))return ok(flags.systemd?'systemd':'init');
  if(args.some(x=>x.startsWith('test -s')))return flags.configured?ok(''):fail();
  if(args.includes('id'))return ok('hostuser');
  if(args.includes('show-user'))return ok('Linger='+(flags.linger?'yes':'no'));
  if(args.includes('enable-linger')){flags.linger=true;return ok('');}
  if(args.includes('show'))return ok(`LoadState=${flags.service?'loaded':'not-found'}\nActiveState=${flags.running?'active':'inactive'}\nSubState=${flags.running?'running':'dead'}\nUnitFileState=${flags.enabled?'enabled':'disabled'}\nRestart=${flags.restart?'always':'no'}\nMainPID=${flags.running?'123':'0'}`);
  if(args.includes('health'))return ok(JSON.stringify({ok:flags.reachable,secret:'must-not-leak'}));
  if(args.includes('install')){if(flags.failService)return fail();flags.service=true;return ok('');}
  if(args.includes('enable')){if(flags.failService)return fail();flags.enabled=true;flags.running=true;return ok('');}
  if(args.some(x=>x.includes('https://openclaw.ai/install-cli.sh'))){if(flags.failRuntime)return fail();flags.runtime=true;return ok('');}
  throw Error('Unexpected command '+JSON.stringify(args));
 };
 const manager=createManager({inventory:async()=>({wsl:{distributions:[{name:'Ubuntu-24.04'}]}}),execute,readBoot:async()=>flags.boot,installBoot:async()=>{if(flags.failBoot)throw Error('startup');flags.boot=true;},onChange:s=>events.push({...s})});
 return {manager,calls,events,flags};
}
test('healthy existing gateway is preserved, checked, and not reinstalled or restarted',async()=>{
 const f=fixture();const result=await f.manager.prepare('Ubuntu-24.04');assert.equal(result.phase,'ready');assert.equal(result.checks.pid,123);assert.ok(!f.calls.some(a=>a.includes('install')||a.includes('restart')||a.includes('kill')));assert.ok(!JSON.stringify(result).includes('must-not-leak'));
});
test('missing startup and linger are configured, then verified',async()=>{
 const f=fixture({boot:false,linger:false});const r=await f.manager.prepare('Ubuntu-24.04');assert.equal(r.phase,'ready');assert.ok(f.events.some(s=>s.phase==='startup'));assert.ok(f.calls.some(a=>a.includes('enable-linger')));
});
test('foreground gateway is not killed or duplicated',async()=>{
 const f=fixture({running:false,service:false});const r=await f.manager.prepare('Ubuntu-24.04');assert.equal(r.issue,'foreground');assert.ok(!f.calls.some(a=>a.includes('install')||a.includes('enable')));
});
test('fresh runtime install stops at account configuration, never claims ready',async()=>{
 const f=fixture({runtime:false,configured:false,service:false,running:false,reachable:false,boot:false});const r=await f.manager.prepare('Ubuntu-24.04');assert.equal(r.issue,'configuration');assert.equal(r.checks.runtime,true);assert.ok(f.events.some(s=>s.phase==='installing'));assert.ok(!f.calls.some(a=>a.includes('install')));
});
test('unsupported Linux is blocked before downloading',async()=>{
 const f=fixture({systemd:false,runtime:false});const r=await f.manager.prepare('Ubuntu-24.04');assert.equal(r.issue,'systemd');assert.ok(!f.calls.some(a=>a.some(x=>x.includes('https://'))));
});
test('service and startup failures cannot produce ready',async()=>{
 for(const flags of [{boot:false,failBoot:true},{service:false,running:false,reachable:false,failService:true},{restart:false}]){const f=fixture(flags);const r=await f.manager.prepare('Ubuntu-24.04');assert.equal(r.phase,'attention');assert.equal(r.busy,false);assert.ok(r.error);}
});
test('unknown distro rejects all commands, and duplicate jobs coalesce',async()=>{
 const f=fixture();assert.equal((await f.manager.prepare('Ubuntu; dangerous')).phase,'attention');assert.equal(f.calls.length,0);
 const a=f.manager.prepare('Ubuntu-24.04'),b=f.manager.prepare('Ubuntu-24.04');assert.equal(a,b);await a;assert.equal(f.manager.get().busy,false);
});
test('OpenClaw arguments remain positional rather than interpolated into shell',()=>{
 const message='hello; $(touch /tmp/nope)';const args=clawArgs('Ubuntu-24.04',['agent','--message',message]);assert.equal(args.at(-1),message);assert.ok(!args[5].includes(message));
});
