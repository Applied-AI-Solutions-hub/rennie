const crypto=require('node:crypto');
const runtimeScript='export PATH="$HOME/.local/share/agent-workspace/openclaw/bin:$PATH"; exec openclaw "$@"';
const clawArgs=(distro,args)=>['-d',distro,'--exec','sh','-lc',runtimeScript,'agent-workspace',...args];
const taskName=distro=>'Agent Workspace Host '+crypto.createHash('sha256').update(distro).digest('hex').slice(0,10);
function parseProperties(text){return Object.fromEntries(text.split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));}
function createManager({inventory,execute,readBoot,installBoot,onChange=()=>{},now=Date.now}){
 let state={phase:'idle',busy:false,checkedAt:null},pending=null;
 const set=patch=>{state={...state,...patch};onChange(state);return state;};
 async function validate(distro){if(typeof distro!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(distro))throw Error('distro');const found=await inventory();if(!found.wsl?.distributions.some(d=>d.name===distro))throw Error('distro');}
 async function probe(distro){
  await validate(distro);
  // Starting a stopped distro can outlast the probe timeout. Warm it first, and never read a killed probe as a missing runtime.
  const warm=await execute('wsl.exe',['-d',distro,'--exec','true'],{timeout:120000});
  const cli=warm.timedOut?warm:await execute('wsl.exe',clawArgs(distro,['--version']));
  if(cli.timedOut)throw Error('timeout');
  const runtime=cli.ok&&/\d+\.\d+\.\d+/.test(cli.output);
  const service=await execute('wsl.exe',['-d',distro,'--exec','systemctl','--user','show','openclaw-gateway.service','--property=LoadState,ActiveState,SubState,UnitFileState,Restart,MainPID']);
  const unit=service.ok?parseProperties(service.output):{};
  const init=await execute('wsl.exe',['-d',distro,'--exec','ps','-p','1','-o','comm=']);
  const config=await execute('wsl.exe',['-d',distro,'--exec','sh','-lc','test -s "${OPENCLAW_CONFIG_PATH:-${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/openclaw.json}"']);
  const identity=await execute('wsl.exe',['-d',distro,'--exec','id','-un']);
  const user=identity.ok?identity.output.trim():'';
  const linger=user?await execute('wsl.exe',['-d',distro,'--exec','loginctl','show-user',user,'-p','Linger']):{ok:false,output:''};
  const health=runtime?await execute('wsl.exe',clawArgs(distro,['health','--json'])):{ok:false,output:''};
  let reachable=false;try{reachable=health.ok&&JSON.parse(health.output.slice(health.output.indexOf('{'))).ok===true;}catch{}
  const boot=await readBoot(distro);
  return {distro,runtime,version:runtime?cli.output.match(/\d+\.\d+\.\d+/)?.[0]:null,configured:config.ok,systemd:init.ok&&init.output.trim()==='systemd',service:unit.LoadState==='loaded',running:unit.ActiveState==='active'&&unit.SubState==='running',restart:['always','on-failure'].includes(unit.Restart),enabled:unit.UnitFileState==='enabled',linger:linger.ok&&/Linger=yes/.test(linger.output),reachable,boot,user,pid:Number(unit.MainPID)||null,checkedAt:now()};
 }
 function check(distro){if(pending)return pending;pending=Promise.resolve().then(async()=>{set({phase:'checking',operation:'check',busy:true,error:null,issue:null,distro,checks:null});try{const checks=await probe(distro);return set({phase:'checked',checks,busy:false,checkedAt:now()});}catch{return set({phase:'attention',busy:false,error:'We could not inspect this Linux environment. Check that it has finished its first-time setup, then try again.'});}}).finally(()=>pending=null);return pending;}
 function prepare(distro){if(pending)return pending;pending=Promise.resolve().then(async()=>{
  set({phase:'checking',operation:'prepare',busy:true,error:null,issue:null,distro,checks:null});
  try{
   let checks=await probe(distro);set({checks});
   if(!checks.systemd)throw Error('systemd');
   if(!checks.user||!/^[a-z_][a-z0-9_-]*\$?$/i.test(checks.user)||checks.user==='root')throw Error('user');
   if(!checks.runtime){
    set({phase:'installing'});
    const install=await execute('wsl.exe',['-d',distro,'--exec','sh','-lc','set -eu; file=$(mktemp); trap \'rm -f "$file"\' EXIT; curl --fail --silent --show-error --location --proto =https --tlsv1.2 https://openclaw.ai/install-cli.sh -o "$file"; bash "$file" --prefix "$HOME/.local/share/agent-workspace/openclaw" --version 2026.9.3 --no-onboard'],{timeout:600000});
    if(!install.ok)throw Error('runtime');checks=await probe(distro);set({checks});if(!checks.runtime)throw Error('runtime');
   }
   // Never kill an unknown foreground Gateway or overwrite a working installation.
   if(checks.reachable&&!checks.running)throw Error('foreground');
   if(!checks.configured)throw Error('configuration');
   if(!checks.service){
    set({phase:'service'});
    const installed=await execute('wsl.exe',clawArgs(distro,['gateway','install','--runtime','node','--json']),{timeout:90000});
    if(!installed.ok)throw Error('service');
   }
   set({phase:'background'});
   if(!checks.linger){const result=await execute('wsl.exe',['-d',distro,'-u','root','--exec','loginctl','enable-linger',checks.user]);if(!result.ok)throw Error('linger');}
   const enable=await execute('wsl.exe',['-d',distro,'--exec','systemctl','--user','enable','--now','openclaw-gateway.service']);if(!enable.ok)throw Error('service');
   if(!checks.boot){set({phase:'startup'});await installBoot(distro);}
   set({phase:'verifying'});checks=await probe(distro);set({checks});
   if(!checks.service||!checks.running||!checks.enabled||!checks.linger||!checks.boot||!checks.restart)throw Error('verification');
   return set({phase:checks.reachable?'ready':'attention',busy:false,checks,checkedAt:now(),error:checks.reachable?null:'The background service is installed, but the agent is not responding yet. Check again in a moment. If it stays unavailable, verify the agent configuration before retrying.'});
  }catch(error){
   const messages={runtime:'OpenClaw could not finish downloading. Check the internet connection and try Prepare Host again. Your existing setup has not been replaced.',foreground:'A gateway is responding outside the Linux service. We will not terminate an unidentified process. Close that gateway through its existing launcher, then choose Prepare Host again.',service:'Linux could not install or start its background service. Check that systemd is enabled and that OpenClaw onboarding has created its configuration.',user:'This Linux environment needs a regular user account before it can host your agent.',linger:'Linux could not keep the user service active after sign-out. Try again or open the technical details.',verification:'The background checks have not all passed. Check status again; this Host is not marked ready.'};
   Object.assign(messages,{distro:'Choose one of the Linux environments detected on this PC.',timeout:'This Linux environment took too long to respond. It may still be starting. Wait a moment, then try again.',systemd:'This Linux environment does not have its service manager enabled. No software was installed. Enable systemd in this environment before preparing its Host.',configuration:'OpenClaw is installed. AI account onboarding is still required before we can start a usable Host. The in-app account wizard is not available in this preview.',startup:'Windows did not register the background startup task. Your gateway may still be running, but automatic startup is not verified.'});
   return set({phase:'attention',issue:error.message,busy:false,error:messages[error.message]||'Host setup could not finish. Check status, then retry the incomplete step.'});
  }
 }).finally(()=>pending=null);return pending;}
 return {check,prepare,get:()=>state};
}
module.exports={createManager,clawArgs,taskName,parseProperties};
