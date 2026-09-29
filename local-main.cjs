const {app,ipcMain,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createLocalApi,createLocalSetup,MODELS}=require('./local-model.cjs');
const {createWindowsRuntime}=require('./local-runtime.cjs');
const {createOpenClaw}=require('./openclaw-native.cjs');
const preflight=require('./preflight.cjs');
module.exports=function register(getWindow,onSelected,onReady=()=>{}) {
  let manager,openclaw;
  const claw=()=>openclaw||(openclaw=createOpenClaw({directory:path.join(app.getPath('userData'),'openclaw')}));
  // Ollama stores models under OLLAMA_MODELS or %USERPROFILE%\.ollama; its runtime, OpenClaw and downloads use the profile drive.
  const free=dir=>{try{const s=fs.statfsSync(dir);return s.bavail*s.bsize;}catch{return NaN;}};
  const drive=dir=>path.parse(path.resolve(dir)).root.toLowerCase();
  const assess=needs=>{const system=app.getPath('userData'),models=[process.env.OLLAMA_MODELS,path.join(os.homedir(),'.ollama')].find(dir=>dir&&fs.existsSync(dir));
    return preflight.assess({freeBytes:free(system),...(models&&drive(models)!==drive(system)?{modelFreeBytes:free(models)}:{}),totalMemory:os.totalmem(),...needs});};
  // One shape for status replies and progress events, so the UI never has to patch fields together.
  const snapshot=state=>({...state,models:MODELS,log:state.phase==='attention'&&openclaw?openclaw.log():[]});
  const get=()=>{
    if(manager)return manager;
    const file=path.join(app.getPath('userData'),'local-setup.json');
    const api=createLocalApi();
    manager=createLocalSetup({api,platform:createWindowsRuntime({directory:path.join(app.getPath('userData'),'installers'),api}),openclaw:process.platform==='win32'?claw():null,onReady,checkSpace:assess,
      read:()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw Error('Saved local setup could not be read. It has not been overwritten.');}},
      write:value=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);},
      onChange:value=>{const window=getWindow();if(window&&!window.isDestroyed())window.webContents.send('local-progress',snapshot(value));}
    });return manager;
  };
  // Returns immediately: the window's first paint waits for this.
  ipcMain.handle('local-status',()=>snapshot(get().get()));
  // Slower (contacts Ollama, reads the registry and disk), so the UI loads it after the page is showing.
  // Uses the same needs() that setup enforces, so the page and setup never disagree.
  ipcMain.handle('local-pc',async(_,model)=>{
    const chosen=typeof model==='string'&&MODELS.some(m=>m.id===model)?model:get().get().model;
    try{return {...assess(await get().needs(chosen)),recommended:preflight.recommendModel(os.totalmem(),MODELS)};}catch{return null;}
  });
  ipcMain.handle('local-prepare',(_,choice)=>{
    const current=get();if(current.get().busy)return current.get();
    const model=choice?.model;
    const agentName=typeof choice?.agentName==='string'&&choice.agentName.trim()?choice.agentName.trim().slice(0,40):null;
    const promise=current.prepare(model,{agentName});onSelected(model);promise.catch(()=>{});return {...current.get(),busy:true};
  });
  // OpenClaw's own diagnostics. Foxsocket shows the findings; it does not guess.
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
  return {get,status:(model,options)=>get().status(model,options),verify:(model,options)=>get().verify(model,options),invalidate:()=>get().invalidate(),openclaw:claw};
};
