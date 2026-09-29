const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const setup=require('./setup');
const agent=require('./foxsocket-agent.cjs');
test('fresh setup defaults to Rennie while existing names and IDs survive',()=>{
 assert.equal(setup.record(null).agentName,'Rennie');
 for(const name of ['Sparky','Customer assistant']){
  const saved={schemaVersion:1,deviceId:'keep-me',agentName:name};
  assert.equal(setup.fromInstaller(saved,{role:'host'}),saved);
  assert.equal(saved.agentName,name);
 }
});
test('bundled Rennie templates never overwrite existing agent identity or graph',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rennie-brand-'));
 try{
  agent.ensure(dir);
  assert.match(fs.readFileSync(path.join(dir,'agent/IDENTITY.md'),'utf8'),/Name: Rennie/);
  const identity=path.join(dir,'agent/IDENTITY.md'),graph=path.join(dir,'agent/GRAPH.json');
  fs.writeFileSync(identity,'Name: Sparky\nCustom identity');fs.writeFileSync(graph,'{"nodes":[{"id":"saved"}]}');
  agent.ensure(dir);
  assert.equal(fs.readFileSync(identity,'utf8'),'Name: Sparky\nCustom identity');
  assert.equal(JSON.parse(fs.readFileSync(graph)).nodes[0].id,'saved');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('display rename retains the old profile path before app modules load',()=>{
 const prefix=fs.readFileSync(path.join(__dirname,'main.js'),'utf8').split('let win,tray')[0];
 const start=userData=>{const calls=[];const app={getName:()=>'Rennie',getPath:name=>name==='userData'?userData:'/existing-appdata',setPath:(...args)=>calls.push(args)};vm.runInNewContext(prefix,{process:{argv:[]},require:name=>name==='electron'?{app}:require(name)});return calls;};
 assert.deepEqual(start(path.join('/existing-appdata','Rennie')),[['userData',path.join('/existing-appdata','Foxsocket')]]);
 assert.deepEqual(start('/qa/profile'),[],'a profile chosen before startup, as the smoke tests do, is kept');
 const pkg=require('./package.json');assert.equal(pkg.name,'foxsocket');assert.equal(pkg.build.appId,'solutions.appliedai.commandcenter');
 assert.equal(pkg.build.productName,'Rennie');assert.equal(pkg.build.win.executableName,'Foxsocket');
});
