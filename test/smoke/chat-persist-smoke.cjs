const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path');
const profile=path.join(__dirname,'..','..','.qa','chat-persist-test-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
require('../../src/main');
// One disk failure on the next state.json write, after startup has already persisted. Every later write succeeds.
const write=fs.writeFileSync;let injected=false;
const inject=()=>{fs.writeFileSync=(file,...rest)=>{if(!injected&&String(file).endsWith('state.json.tmp')){injected=true;fs.writeFileSync=write;const error=Error('ENOSPC: no space left on device, write');error.code='ENOSPC';throw error;}return write(file,...rest);};};
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];await new Promise(r=>win.webContents.isLoading()?win.webContents.once('did-finish-load',r):r());
 try{
  await new Promise(r=>setTimeout(r,300));inject();
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const check=(v,m)=>{if(!v)throw Error(m)};let failure='';
   try{await desktop.invoke('chat','persist failure');}catch(e){failure=e.message;}check(failure.includes('ENOSPC'),'Persist failure surfaces to the sender');
   const state=await desktop.invoke('state');check(state.busy===false,'busy is released after a persist failure');check(state.chat.at(-1)?.role==='error','Failure is recorded in the conversation');check(!state.chat.some(m=>m.role==='user'&&m.text==='persist failure'),'The unsent message is not kept, so a retry does not send it twice');check(/not sent/.test(state.chat.at(-1).text),'The error says the message was not sent');
   let second='';try{await desktop.invoke('chat','after the failure');}catch(e){second=e.message;}check(!/still responding/.test(second),'A later message is not refused as busy, got: '+second);return {busyReleased:true,failureRecorded:true,nextMessageAccepted:true};
  })()`);
  if(!injected)throw Error('Disk failure was never injected');
  fs.writeFileSync(path.join(__dirname,'..','..','.qa','chat-persist-results.json'),JSON.stringify(result,null,2));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(__dirname,'..','..','.qa','chat-persist-results.json'),JSON.stringify({error:error.stack}));app.exit(1)}
});
