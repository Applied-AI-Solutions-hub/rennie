const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
const profile=path.join(__dirname,'.qa','workspace-test-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
require('./main');
let chatCalls=0;
for(const action of ['gateway','metrics','setup-check','chat','host-install-linux'])ipcMain.removeHandler(action);
let linuxSetupCalls=0;
ipcMain.handle('host-install-linux',()=>{linuxSetupCalls++;return {};});
ipcMain.handle('gateway',()=>({ok:false}));
ipcMain.handle('metrics',()=>({cpu:3,cpuName:'Test CPU',memory:8e9,memoryTotal:16e9}));
ipcMain.handle('setup-check',()=>({wsl:{distributions:[]},tailscale:{status:'not-installed'}}));
ipcMain.handle('chat',async(_,text)=>{chatCalls++;await new Promise(r=>setTimeout(r,200));if(text==='failure')throw Error('Expected offline failure');return {chat:[{role:'user',text},{role:'assistant',text:'**Verified reply**\n\n<script>unsafe</script>'}]}});
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];await new Promise(r=>win.webContents.isLoading()?win.webContents.once('did-finish-load',r):r());
 try{
  await new Promise(r=>setTimeout(r,300));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const $=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m)};
   check(document.body.dataset.page==='setup','Fresh install must open setup');
   $('[data-role=host]').click();await wait(100);check($('#local-model'),'Fresh PC offers local models');check($('#content').textContent.includes('No API key is required'),'Local model needs no cloud key');
   $('[data-action=legacy-host]').click();await wait(100);check($('#content').textContent.includes('None found'),'Optional Linux requirements');check($('#content').textContent.includes('Let Foxsocket prepare Ubuntu'),'Missing Linux guidance');
   $('[data-host=install-linux]').click();await wait(100);check(!$('[data-host=install-linux]').disabled,'Ubuntu setup can be reopened after postponing');
   const saved=await desktop.invoke('state');check(saved.setup.role==='host','Host choice persists');
   $('[data-page=settings]').click();$('[data-action=help]').click();await wait(60);check($('#help').open&&$('#help-text').textContent.includes('beginner walkthrough'),'Offline setup help');$('#close-help').click();
   $('[data-page=chat]').click();await wait(20);$('#chat-input').value='A draft';$('#chat-input').dispatchEvent(new Event('input',{bubbles:true}));$('[data-page=tasks]').click();$('[data-page=chat]').click();check($('#chat-input').value==='A draft','Draft survives navigation');
   $('#chat-form').requestSubmit();$('#chat-form').requestSubmit();check($('#send').disabled,'Busy blocks duplicate submit');await wait(400);check($('.bubble strong'),'Formatted reply');check(!$('.bubble script'),'Escaped model HTML');check($('#chat-input').value==='','Draft cleared on success');check($('#send').disabled,'Empty send disabled');
   $('#chat-input').value='failure';$('#chat-input').dispatchEvent(new Event('input',{bubbles:true}));$('#chat-form').requestSubmit();await wait(400);check($('#chat-input').value==='failure','Failure retains draft');
   $('[data-page=tasks]').click();$('#task-input').value='Fresh host test';$('#task-form').requestSubmit();await wait(80);check($('.task span').textContent==='Fresh host test','Task save');
   $('[data-page=devices]').click();await wait(200);check(!$('#content').textContent.includes('Lighting')&&!document.querySelector('[data-action=lighting]'),'No lighting controls');check(!$('#content').textContent.includes('Kit')&&!$('#content').textContent.includes('Nox'),'No placeholder devices');
   $('[data-page=settings]').click();check(!$('#close-tray').checked,'Fresh app closes fully');
   $('#interface-motion').checked=false;$('#interface-motion').dispatchEvent(new Event('change',{bubbles:true}));check(document.documentElement.dataset.motion==='off','Motion preference');
   $('[data-page=chat]').click();return {freshHostSetup:true,savedRole:true,offlineHelp:true,draftRetention:true,duplicateGuard:true,formattedReply:true,escapedHTML:true,failureRecovery:true,tasks:true,genericDevices:true,closePreference:true,reducedMotion:true};
  })()`);
  if(linuxSetupCalls!==1)throw Error('Ubuntu setup button must launch the installer helper once');
  for(const size of [[1440,900],[1000,720],[760,600]]){win.setContentSize(...size);await new Promise(r=>setTimeout(r,100));const layout=await win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,composer:document.querySelector('#chat-form').getBoundingClientRect().bottom<=innerHeight})`);if(layout.overflow||!layout.composer)throw Error('Layout failure '+JSON.stringify(layout));}
  if(chatCalls!==2)throw Error('Unexpected chat request count '+chatCalls);
  fs.writeFileSync(path.join(__dirname,'.qa','workspace-results.json'),JSON.stringify({...result,viewports:true,chatCalls},null,2));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(__dirname,'.qa','workspace-results.json'),JSON.stringify({error:error.stack}));app.exit(1)}
});
