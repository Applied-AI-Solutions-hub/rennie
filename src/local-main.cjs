const {app,ipcMain,dialog,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createLocalApi,createLocalSetup,MODELS}=require('./local-model.cjs');
const {createWindowsRuntime}=require('./local-runtime.cjs');
const {createOpenClaw}=require('./openclaw-native.cjs');
const llama=require('./llama-runtime.cjs');
const preflight=require('./preflight.cjs');
module.exports=function register(getWindow,onSelected,onReady=()=>{},chatBusy=()=>false,getAgent=()=> 'main') {
  let manager,openclaw,engine=null,hardware=null;
  const development=!app.isPackaged&&process.argv.includes('--rennie-dev');
  // The llama.cpp engine and its models live outside the roaming profile: they are large and belong to this PC.
  const engineDir=()=>development?path.join(app.getPath('userData'),'engine'):path.join(process.env.LOCALAPPDATA||app.getPath('userData'),'Rennie','engine');
  // The largest NVIDIA GPU decides the recommended model. Detected once per run.
  const recommendation=()=>hardware||(hardware=llama.detect().then(found=>llama.choose(found)).catch(()=>null));
  const claw=()=>openclaw||(openclaw=development?require('./dev-openclaw.cjs').createDevOpenClaw({directory:path.join(app.getPath('userData'),'native-openclaw'),getTarget:()=>{if(!engine)throw Error('Set up the local engine first.');return engine.target(manager?.get().model||'qwen3.5-9b');}}):createOpenClaw({directory:path.join(app.getPath('userData'),'openclaw')}));
  let nativeSkills;
  const skillManager=()=>{const native=claw();if(!native.configured())throw Error('Set up your OpenClaw assistant before enabling skills.');return nativeSkills||(nativeSkills=require('./native-skills.cjs').createNativeSkills({claw:native,getAgent}));};
  const idle=()=>{if(chatBusy()||manager?.get().busy)throw Error('Wait for the current reply or setup to finish before changing skills.');};
  ipcMain.handle('skills-status',()=>skillManager().status());
  ipcMain.handle('skills-prepare',(_,choice)=>{idle();if(typeof choice?.search!=='boolean')throw Error('Choose whether to enable web search.');return skillManager().prepare(choice);});
  ipcMain.handle('skills-toggle',(_,choice)=>{idle();return skillManager().toggle(choice?.name,choice?.enabled);});
  ipcMain.handle('skills-search-off',()=>{idle();return skillManager().setSearch(false);});
  ipcMain.handle('skills-restart',async()=>{idle();const m=skillManager();await claw().restartGateway({required:true});await claw().startGateway();return m.status();});
  ipcMain.handle('skills-folder',async()=>{const dir=await skillManager().workspace();fs.mkdirSync(dir,{recursive:true});return shell.openPath(dir);});
  ipcMain.handle('skills-add-files',async()=>{idle();const m=skillManager();const result=await dialog.showOpenDialog(getWindow(),{title:'Add files to your assistant workspace',properties:['openFile','multiSelections'],filters:[{name:'Text documents',extensions:['txt','md','csv','json']}]});return result.canceled?[]:m.addFiles(result.filePaths);});
  // Ollama stores models under OLLAMA_MODELS or %USERPROFILE%\.ollama; its runtime, OpenClaw and downloads use the profile drive.
  const free=dir=>{try{const s=fs.statfsSync(dir);return s.bavail*s.bsize;}catch{return NaN;}};
  const drive=dir=>path.parse(path.resolve(dir)).root.toLowerCase();
  // The llama.cpp engine keeps everything on the local profile drive; Ollama may keep models elsewhere.
  const assess=needs=>{if(engine)return preflight.assess({freeBytes:free(process.env.LOCALAPPDATA||app.getPath('userData')),totalMemory:os.totalmem(),...needs});
    const system=app.getPath('userData'),models=[process.env.OLLAMA_MODELS,path.join(os.homedir(),'.ollama')].find(dir=>dir&&fs.existsSync(dir));
    return preflight.assess({freeBytes:free(system),...(models&&drive(models)!==drive(system)?{modelFreeBytes:free(models)}:{}),totalMemory:os.totalmem(),...needs});};
  // One shape for status replies and progress events, so the UI never has to patch fields together.
  const models=()=>engine?llama.MODELS:MODELS;
  const snapshot=state=>({...state,development,engine:engine?'llama':'ollama',models:models(),log:state.phase==='attention'&&openclaw?openclaw.log():[]});
  const get=()=>{
    if(manager)return manager;
    const file=path.join(app.getPath('userData'),'local-setup.json');
    let saved;try{saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Saved local setup could not be read. It has not been overwritten.');saved=null;}
    // New setups use the llama.cpp engine. A setup already working on Ollama keeps it until Ollama is retired (docs/engine-plan.md);
    // an unfinished Ollama setup starts again on llama.cpp.
    const ollamaReady=saved&&saved.engine!=='llama'&&saved.phase==='ready'&&!llama.MODELS.some(m=>m.id===saved.model);
    if(!ollamaReady){
      engine=llama.createLlamaRuntime({directory:engineDir(),...(development?{sharedModelDirectory:path.join(process.env.LOCALAPPDATA||app.getPath('userData'),'Rennie','engine','models'),port:18082,scheduleEnabled:false,taskName:'Rennie development '+require('node:crypto').createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0,12)}:{})});
      if(saved&&!llama.MODELS.some(m=>m.id===saved.model))saved={agentName:saved.agentName||null};
    }
    const api=createLocalApi();
    manager=createLocalSetup({api,platform:createWindowsRuntime({directory:path.join(app.getPath('userData'),'installers'),api}),engine,defaultModel:engine?llama.MODELS.at(-1).id:undefined,openclaw:process.platform==='win32'?claw():null,onReady,checkSpace:assess,
      read:()=>saved,
      write:value=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);},
      onChange:value=>{const window=getWindow();if(window&&!window.isDestroyed())window.webContents.send('local-progress',snapshot(value));}
    });return manager;
  };
  // Returns immediately: the window's first paint waits for this.
  ipcMain.handle('local-status',()=>snapshot(get().get()));
  // Slower (contacts Ollama, reads the registry and disk), so the UI loads it after the page is showing.
  // Uses the same needs() that setup enforces, so the page and setup never disagree.
  ipcMain.handle('local-pc',async(_,model)=>{
    const current=get(),chosen=typeof model==='string'&&models().some(m=>m.id===model)?model:current.get().model;
    try{
      const pick=engine?await recommendation():null;
      const selected=engine?await engine.plan(chosen):null;
      const needs=await current.needs(chosen,selected);
      return {...assess(needs),modelCached:!needs.needsModel,...(selected&&!selected.fits?{enoughSpace:false,problem:selected.problem}:{}),selectedBackend:selected?.build,backendReason:selected?.reason,recommended:engine?pick?.model||llama.MODELS.at(-1).id:preflight.recommendModel(os.totalmem(),MODELS),recommendedReason:pick?.reason||null,lowMemory:!!pick?.lowMemory};
    }catch(error){console.error('Local hardware check failed:',error.message);return null;}
  });
  ipcMain.handle('local-prepare',(_,choice)=>{
    const current=get();if(current.get().busy)return current.get();
    const model=choice?.model;
    const agentName=typeof choice?.agentName==='string'&&choice.agentName.trim()?choice.agentName.trim().slice(0,40):null;
    const promise=current.prepare(model,{agentName});onSelected(model);promise.catch(()=>{});return {...current.get(),busy:true};
  });
  // OpenClaw's own diagnostics. Rennie shows the findings; it does not guess.
  const installed=async()=>{if(!await claw().locate())throw Error('OpenClaw is not installed yet. Choose Resume setup first.');};
  ipcMain.handle('openclaw-doctor',async()=>{await installed();return claw().doctor();});
  ipcMain.handle('openclaw-repair',async()=>{
    if(get().get().busy)throw Error('Wait for setup to finish before repairing OpenClaw.');
    await installed();const result=await claw().repair();get().invalidate();return result;
  });
  // Persisted stages survive normal quit/reboot. A download can be retried using
  // Ollama's layer cache; never silently keep the UI closed during a long job.
  const confirmExit=event=>{if(manager?.get().busy){event.preventDefault();const options={type:'question',buttons:['Keep setting up','Exit and resume later'],defaultId:0,cancelId:0,message:'Local setup is still running.',detail:'You can resume setup after reopening Rennie. Downloaded parts are kept.'};const window=getWindow();const choice=window&&!window.isDestroyed()?dialog.showMessageBoxSync(window,options):dialog.showMessageBoxSync(options);if(choice===1)app.exit(0);else if(window&&!window.isDestroyed()){window.show();window.focus();}}};
  app.on('browser-window-created',(_,window)=>window.on('close',confirmExit));
  app.on('before-quit',confirmExit);
  app.on('will-quit',()=>{if(development)openclaw?.dispose?.();});
  // Model information pages come from the pinned catalog, never from the page asking.
  const license=id=>{get();const model=engine&&llama.MODELS.find(m=>m.id===id);return model?'https://huggingface.co/'+model.repo:'https://ollama.com/library/llama3.2';};
  // Direct chat with the llama.cpp server, used before OpenClaw has confirmed a reply.
  const complete=(messages,options)=>{const current=get();if(!engine)return null;return engine.complete(current.get().model,messages,options);};
  return {get,status:(model,options)=>get().status(model,options),verify:(model,options)=>get().verify(model,options),invalidate:()=>get().invalidate(),openclaw:claw,engine:()=>(get(),engine?'llama':'ollama'),complete,license};
};
