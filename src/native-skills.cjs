'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const STARTERS=['rennie-research','rennie-documents'];
const FILE_TOOLS=['read','write','edit'];
const SEARCH_DISCLOSURE='Web search sends your search queries to Parallel. Its free search needs no account or API key. Reading a web page contacts that website.';
function extendTools(current={},names=[]){
  // Add capabilities to the existing policy; do not replace profiles or deny rules.
  const key=Array.isArray(current.allow)?'allow':'alsoAllow';
  return {[key]:[...new Set([...(current[key]||[]),...names])],fs:{workspaceOnly:true}};
}
function createNativeSkills({claw,source=path.join(__dirname,'skills')}){
 let changing=false;
 async function status(){
  const [report,search]=await Promise.all([claw.skills(),claw.configGet('tools.web.search')]);
  return {workspace:report.workspaceDir,searchEnabled:search?.enabled===true,searchProvider:search?.provider||null,disclosure:SEARCH_DISCLOSURE,skills:(report.skills||[]).map(s=>({name:s.name,description:s.description,enabled:!s.disabled,eligible:!!s.eligible,visible:!!s.modelVisible,source:s.source,starter:STARTERS.includes(s.name),missing:s.missing}))};
 }
 async function workspace(){const report=await claw.skills();if(!path.isAbsolute(report.workspaceDir||''))throw Error('OpenClaw has not provided an absolute workspace path.');return report.workspaceDir;}
 async function change(fn){if(changing)throw Error('A skills change is already in progress.');changing=true;try{return await fn();}finally{changing=false;}}
 async function prepare({search=false}={}){return change(async()=>{
  const root=await workspace();fs.mkdirSync(root,{recursive:true});const canonical=fs.realpathSync(root);
  const targets=STARTERS.map(name=>({name,file:path.join(root,'skills',name,'SKILL.md'),text:fs.readFileSync(path.join(source,name,'SKILL.md'),'utf8')}));
  for(const item of targets){
   for(const dir of [path.join(root,'skills'),path.dirname(item.file)]){if(fs.existsSync(dir)&&!fs.realpathSync(dir).startsWith(canonical+path.sep))throw Error('The skills directory points outside the workspace.');}
   if(fs.existsSync(item.file)&&(fs.lstatSync(item.file).isSymbolicLink()||fs.readFileSync(item.file,'utf8')!==item.text))throw Error('An existing '+item.name+' skill differs. It has been preserved; review it before upgrading.');
  }
  const current=await claw.configGet('agents.entries.main.tools')||{};
  const plugin=search?await claw.configGet('plugins.entries.parallel'):null;
  if(search&&!plugin)await claw.installSearch();
  const entries=Object.fromEntries(STARTERS.map(name=>[name,{enabled:true}]));
  const patch={skills:{entries},agents:{entries:{main:{tools:extendTools(current,[...FILE_TOOLS,...(search?['web_search','web_fetch']:[])])}}}};
  if(search){
   patch.tools={web:{search:{enabled:true,provider:'parallel-free'},fetch:{enabled:true}}};
   const allowed=await claw.configGet('plugins.allow');
   patch.plugins={entries:{parallel:{enabled:true}},...(Array.isArray(allowed)?{allow:[...new Set([...allowed,'parallel'])]}:{})};
  }
  // Keep native configuration validation/merge semantics and retain every other skill/plugin.
  await claw.configPatch(patch);
  for(const item of targets){fs.mkdirSync(path.dirname(item.file),{recursive:true});if(!fs.existsSync(item.file))fs.writeFileSync(item.file,item.text,{flag:'wx'});}
  return status();
 });}
 async function toggle(name,enabled){return change(async()=>{
  if(typeof name!=='string'||!name||name.length>150||typeof enabled!=='boolean')throw Error('Invalid skill selection.');
  const report=await claw.skills();if(!(report.skills||[]).some(s=>s.name===name))throw Error('This skill is not installed. Refresh the list.');
  const info=await claw.skillInfo(name),key=info.skillKey;
  if(typeof key!=='string'||!key||info.name!==name)throw Error('OpenClaw did not identify this skill configuration.');
  await claw.configPatch({skills:{entries:{[key]:{enabled}}}});return status();
 });}
 async function setSearch(enabled){return change(async()=>{
  if(typeof enabled!=='boolean')throw Error('Invalid search setting.');
  if(enabled)throw Error('Use Enable starter skills with web search to add the required search provider.');
  await claw.configPatch({tools:{web:{search:{enabled:false}}}});return status();
 });}
 async function addFiles(files){const root=await workspace();fs.mkdirSync(root,{recursive:true});const names=[];
  for(const file of files){const stat=fs.statSync(file);if(!stat.isFile()||! /\.(txt|md|csv|json)$/i.test(file)||stat.size>8*1024*1024)throw Error('Choose text, Markdown, CSV or JSON files under 8 MB.');}
  for(const file of files){const name=crypto.randomUUID().slice(0,8)+'-'+path.basename(file);fs.copyFileSync(file,path.join(root,name),fs.constants.COPYFILE_EXCL);names.push(name);}return names;
 }
 return {status,workspace,prepare,toggle,setSearch,addFiles};
}
module.exports={createNativeSkills,extendTools,STARTERS,SEARCH_DISCLOSURE};
