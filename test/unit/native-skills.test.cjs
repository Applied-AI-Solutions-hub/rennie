const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createNativeSkills,extendTools,STARTERS}=require('../../src/native-skills.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rennie-native-skills-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const patches=[],installed=[];const values={'agents.entries.main.tools':{profile:'coding',allow:['existing-tool'],deny:['exec']},'plugins.allow':['existing-plugin']};
 const claw={skills:async()=>({workspaceDir:root,skills:[{name:'existing',eligible:true,modelVisible:true,disabled:false},...STARTERS.filter(n=>fs.existsSync(path.join(root,'skills',n,'SKILL.md'))).map(name=>({name,eligible:true,modelVisible:true}))]}),configGet:async k=>values[k],configPatch:async p=>patches.push(p),installSearch:async()=>installed.push('parallel')};
 claw.skillInfo=async name=>({name,skillKey:name==='existing'?'existing-config-key':name});
 return {root,patches,installed,claw,manager:createNativeSkills({claw})};
}
test('starter skills extend the native policy without replacing profiles, denials or other extensions',async t=>{
 const f=fixture(t);await f.manager.prepare({search:true});const p=f.patches[0];
 assert.deepEqual(p.agents.entries.main.tools.allow,['existing-tool','read','write','edit','web_search','web_fetch']);
 assert.equal(p.agents.entries.main.tools.fs.workspaceOnly,true);assert.equal(p.agents.entries.main.tools.profile,undefined);assert.equal(p.agents.entries.main.tools.deny,undefined);
 assert.deepEqual(p.plugins.allow,['existing-plugin','parallel']);assert.equal(p.tools.web.search.provider,'parallel-free');assert.equal(f.installed.length,1);
 assert.deepEqual(Object.keys(p.skills.entries),STARTERS);assert.equal(p.skills.allowBundled,undefined);
 for(const name of STARTERS)assert.match(fs.readFileSync(path.join(f.root,'skills',name,'SKILL.md'),'utf8'),/description:/);
 assert.deepEqual(extendTools({alsoAllow:['custom']},['read']),{alsoAllow:['custom','read'],fs:{workspaceOnly:true}});
});
test('offline skills do not install search or change the existing search choice',async t=>{
 const f=fixture(t);await f.manager.prepare({search:false});assert.equal(f.installed.length,0);assert.equal(f.patches[0].tools,undefined);
});
test('existing edited starter instructions are preserved and block a conflicting install',async t=>{
 const f=fixture(t),dir=path.join(f.root,'skills',STARTERS[0]);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'SKILL.md'),'User instructions');
 await assert.rejects(f.manager.prepare(),/preserved/);assert.equal(f.patches.length,0);assert.equal(fs.readFileSync(path.join(dir,'SKILL.md'),'utf8'),'User instructions');
});
test('failed native configuration does not leave automatically discovered starter files',async t=>{
 const f=fixture(t);f.claw.configPatch=async()=>{throw Error('Native validation rejected settings');};
 await assert.rejects(f.manager.prepare(),/validation rejected/);assert.equal(fs.existsSync(path.join(f.root,'skills')),false);
});
test('toggle targets only an installed skill and changes only its enabled flag',async t=>{
 const f=fixture(t);await f.manager.toggle('existing',false);assert.deepEqual(f.patches,[{skills:{entries:{'existing-config-key':{enabled:false}}}}]);
 await assert.rejects(f.manager.toggle('unknown',true),/not installed/);await assert.rejects(f.manager.toggle('existing','false'),/Invalid/);
});
test('file import copies supported files with unique names and leaves originals intact',async t=>{
 const f=fixture(t),file=path.join(f.root,'input.txt');fs.writeFileSync(file,'original');
 const [name]=await f.manager.addFiles([file]);assert.notEqual(name,'input.txt');assert.equal(fs.readFileSync(path.join(f.root,name),'utf8'),'original');assert.equal(fs.readFileSync(file,'utf8'),'original');
 const exe=path.join(f.root,'bad.exe');fs.writeFileSync(exe,'bad');await assert.rejects(f.manager.addFiles([exe]),/Choose text/);
});

test('starter installation changes the connected agent policy and workspace',async t=>{
 const f=fixture(t),seen=[];const list=f.claw.skills;f.claw.skills=async agent=>{seen.push(agent);return list();};
 const manager=createNativeSkills({claw:f.claw,getAgent:()=> 'writer'});await manager.prepare();assert.equal(f.patches[0].agents.entries.main,undefined);assert.ok(f.patches[0].agents.entries.writer.tools);assert.ok(seen.every(id=>id==='writer'));
});
