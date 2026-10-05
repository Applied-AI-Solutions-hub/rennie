'use strict';
// Normal OpenClaw gateway in a Dev-owned profile; never manages Windows services.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {createOpenClaw}=require('./openclaw-native.cjs');
function createDevOpenClaw({directory,getTarget,port=18791}){
 const config=path.join(directory,'openclaw.json'),state=path.join(directory,'state'),keyFile=path.join(directory,'gateway-key.txt');
 const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('OPENCLAW_'))),OPENCLAW_CONFIG_PATH:config,OPENCLAW_STATE_DIR:state};
 if(fs.existsSync(keyFile))env.RENNIE_DEV_GATEWAY_KEY=fs.readFileSync(keyFile,'utf8').trim();
 if(fs.existsSync(config))env.RENNIE_DEV_MODEL_KEY=getTarget().apiKey;
 const native=createOpenClaw({directory:path.join(directory,'cli'),env});let child=null,starting=null;
 async function install(){if(!await native.locate())throw Error('Install OpenClaw before running the native development assistant.');}
 async function onboard({target}){
  if(!target)throw Error('The development assistant requires the local llama.cpp engine.');
  const reused=native.configured();fs.mkdirSync(state,{recursive:true});
  if(!env.RENNIE_DEV_GATEWAY_KEY){env.RENNIE_DEV_GATEWAY_KEY=crypto.randomBytes(32).toString('hex');fs.writeFileSync(keyFile,env.RENNIE_DEV_GATEWAY_KEY,{flag:'wx',mode:0o600});}
  env.RENNIE_DEV_MODEL_KEY=target.apiKey;await native.locate({refresh:true});
  const model='rennie-local/'+target.modelId;
  const patch={models:{providers:{'rennie-local':{baseUrl:target.baseUrl,apiKey:'${RENNIE_DEV_MODEL_KEY}',api:'openai-completions',agentRuntime:{id:'openclaw'},models:[{id:target.modelId,name:target.modelId,reasoning:false,input:['text'],contextWindow:32768,maxTokens:2048,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}},agents:{defaults:{model:{primary:model},models:{[model]:{params:{chat_template_kwargs:{enable_thinking:false}}}}}}};
  if(!reused){patch.gateway={mode:'local',port,bind:'loopback',auth:{mode:'token',token:'${RENNIE_DEV_GATEWAY_KEY}'}};patch.agents.defaults.workspace=path.join(directory,'workspace');patch.agents.defaults.experimental={localModelLean:true};}
  await native.configPatch(patch);return {reused};
 }
 async function stop(){if(!child)return;const current=child;await new Promise(resolve=>{current.once('close',resolve);current.kill();});if(child===current)child=null;}
 async function startGateway(){
  if(starting)return starting;
  starting=(async()=>{
   if(!native.configured())throw Error('Set up the development assistant first.');
   if(await native.gatewayRunning({fresh:true}))return;
   const located=await native.locate();if(!located)throw Error('OpenClaw is not installed.');
   if(child)throw Error('The development gateway is still starting.');
   fs.mkdirSync(directory,{recursive:true});const log=fs.openSync(path.join(directory,'gateway.log'),'a');
   try{child=spawn(located.node,[located.entry,'gateway','run','--port',String(port),'--bind','loopback'],{env:located.env,windowsHide:true,stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
   let spawnError;child.once('error',e=>{spawnError=e;});const current=child;current.once('close',()=>{if(child===current)child=null;});
   for(let i=0;i<15;i++){if(spawnError||current.exitCode!==null)throw Error('The development gateway could not start. See its local gateway log.');await new Promise(r=>setTimeout(r,1000));if(await native.gatewayRunning({fresh:true}))return;}
   await stop();throw Error('The development gateway did not become ready.');
  })().finally(()=>{starting=null;});return starting;
 }
 async function restartGateway(){if(child)await stop();else if(await native.gatewayRunning({fresh:true}))throw Error('Another process owns this development gateway; close that Dev session first.');await startGateway();}
 return {...native,install,onboard,startGateway,restartGateway,stop,dispose:()=>{child?.kill();},repair:async()=>{throw Error('Use development setup to recover this isolated gateway.');}};
}
module.exports={createDevOpenClaw};
