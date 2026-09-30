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
test('the profile lives in %APPDATA%\\Rennie, and one from before the rename is moved there once',()=>{
 const prefix=fs.readFileSync(path.join(__dirname,'main.js'),'utf8').split('let win,tray')[0];
 const start=(appData,userData=path.join(appData,'Rennie'),{packaged=true,argv=[],files=fs}={})=>{const calls=[];const app={isPackaged:packaged,getName:()=>'Rennie',getPath:name=>name==='userData'?userData:appData,setPath:(...args)=>calls.push(args)};vm.runInNewContext(prefix,{process:{argv},require:name=>name==='electron'?{app}:name==='fs'?files:name==='./dev-main.cjs'?null:require(name)});return calls;};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rennie profile-'));
 try{
  const moved=path.join(root,'moved');fs.mkdirSync(path.join(moved,'Foxsocket'),{recursive:true});fs.writeFileSync(path.join(moved,'Foxsocket','state.json'),'{"chat":[1]}');
  assert.deepEqual(start(moved),[['userData',path.join(moved,'Rennie')]]);
  assert.equal(fs.readFileSync(path.join(moved,'Rennie','state.json'),'utf8'),'{"chat":[1]}','the old profile moved intact');assert.ok(!fs.existsSync(path.join(moved,'Foxsocket')),'nothing is left behind half-moved');
  const both=path.join(root,'both');for(const name of ['Rennie','Foxsocket']){fs.mkdirSync(path.join(both,name),{recursive:true});fs.writeFileSync(path.join(both,name,'state.json'),name);}
  assert.deepEqual(start(both),[['userData',path.join(both,'Rennie')]]);assert.equal(fs.readFileSync(path.join(both,'Foxsocket','state.json'),'utf8'),'Foxsocket','an existing Rennie profile wins and the old one is left alone');
  const fresh=path.join(root,'fresh');fs.mkdirSync(fresh);assert.deepEqual(start(fresh),[['userData',path.join(fresh,'Rennie')]]);
  assert.deepEqual(start(fresh,'/qa/profile'),[],'a profile chosen before startup, as the smoke tests do, is kept');
  const dev=path.join(root,'dev');fs.mkdirSync(path.join(dev,'Foxsocket'),{recursive:true});
  assert.deepEqual(start(dev,path.join(dev,'Rennie'),{packaged:false,argv:['--foxsocket-dev']}),[],'a development launch never moves the real profile');
  assert.deepEqual(start(dev,path.join(dev,'Rennie'),{packaged:false}),[],'running from source (pnpm start) never moves it either');assert.ok(fs.existsSync(path.join(dev,'Foxsocket')));
  // Two copies start together: the other one moves the folder between this one's check and its own move.
  const race=path.join(root,'race');fs.mkdirSync(path.join(race,'Foxsocket'),{recursive:true});fs.writeFileSync(path.join(race,'Foxsocket','state.json'),'{}');
  const other={...fs,renameSync:(from,to)=>{fs.renameSync(from,to);const error=Error('ENOENT: no such file or directory');error.code='ENOENT';throw error;}};
  assert.deepEqual(start(race,undefined,{files:other}),[['userData',path.join(race,'Rennie')]],'the copy that lost the race uses the moved profile, never a new empty one');
  assert.ok(!fs.existsSync(path.join(race,'Foxsocket')));
  // A real failure (the old folder is still there, for example because it is in use) keeps using it for this run.
  const locked=path.join(root,'locked');fs.mkdirSync(path.join(locked,'Foxsocket'),{recursive:true});
  const busy={...fs,renameSync:()=>{const error=Error('EPERM: operation not permitted');error.code='EPERM';throw error;}};
  assert.deepEqual(start(locked,undefined,{files:busy}),[['userData',path.join(locked,'Foxsocket')]]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 const pkg=require('./package.json');assert.equal(pkg.name,'foxsocket');assert.equal(pkg.build.appId,'solutions.appliedai.commandcenter','the app identity stays, so upgrades and saved settings still match');
 assert.equal(pkg.build.productName,'Rennie');assert.equal(pkg.build.win.executableName,'Rennie');
});
