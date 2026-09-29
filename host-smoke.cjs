const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
const profile=path.join(__dirname,'.qa','host-test-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
const setup=require('./setup');fs.writeFileSync(path.join(profile,'state.json'),JSON.stringify({version:1,tasks:[],notes:'',mode:'Focus',chat:[],folders:[],activity:[],closeToTray:false,setup:setup.update(null,{role:'host',deviceName:'My computer'})}));
require('./main');
let prepareCalls=0;
const checks={distro:'Ubuntu-24.04',runtime:true,version:'2026.9.3',systemd:true,configured:true,service:true,running:true,restart:true,enabled:true,linger:true,boot:false,reachable:true,pid:123,checkedAt:Date.now()};
for(const action of ['gateway','metrics','setup-check','host-status','host-check','host-prepare','setup-agents'])ipcMain.removeHandler(action);
ipcMain.handle('gateway',()=>({ok:false}));ipcMain.handle('metrics',()=>({memoryTotal:16e9}));
ipcMain.handle('setup-check',()=>({wsl:{distributions:[{name:'Ubuntu-24.04'}]},tailscale:{status:'connected'}}));
ipcMain.handle('host-status',()=>({phase:'idle',busy:false}));
ipcMain.handle('host-check',()=>{const value={phase:'checked',busy:false,checks};BrowserWindow.getAllWindows()[0].webContents.send('host-progress',value);return value;});
ipcMain.handle('setup-agents',()=>[{id:'main',name:'Test agent'}]);
ipcMain.handle('host-prepare',()=>{prepareCalls++;const w=BrowserWindow.getAllWindows()[0];w.webContents.send('host-progress',{phase:'startup',busy:true,checks});setTimeout(()=>w.webContents.send('host-progress',{phase:'attention',busy:false,checks,error:'Windows did not register the background startup task.'}),300);return {busy:true};});
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 try{
  await new Promise(r=>setTimeout(r,400));
  const result=await win.webContents.executeJavaScript(`(async()=>{const $=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m)};
   $('[data-action=legacy-host]').click();await wait(100);check($('.host-layout'),'Optional OpenClaw Host screen');check($('.host-stages').children.length===5,'Real stages');check(!$('#content pre')&&!$('#content .command'),'No terminal commands as primary flow');
   $('[data-host=prepare]').click();await wait(50);check($('[data-host=prepare]').disabled,'Prepare disabled during job');check($('.host-status').textContent.includes('Working'),'Live progress');await wait(350);check($('.host-error').textContent.includes('Windows did not'),'Recovery explains failed component');check(!$('[data-host=prepare]').disabled,'Retry available');
   $('[data-host-tab=agent]').click();$('[data-action=find-agents]').click();await wait(80);check($('#agent-choice').textContent.includes('Test agent'),'Existing agent selection');
   $('[data-host-tab=network]').click();check($('#content').textContent.includes('Not available in this preview'),'Tailscale not confused with pairing');
   $('[data-host-tab=host]').click();return {hostScreen:true,realProgress:true,recovery:true,agentSelection:true,truthfulNetwork:true};})()`);
  if(prepareCalls!==1)throw Error('Duplicate prepare');
  win.webContents.send('host-progress',{phase:'ready',busy:false,checks:{...checks,boot:true}});await new Promise(r=>setTimeout(r,100));
  for(const size of [[1440,920],[1000,720],[760,600]]){win.setContentSize(...size);await new Promise(r=>setTimeout(r,150));const overflow=await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth');if(overflow)throw Error('Horizontal overflow '+size[0]);fs.writeFileSync(path.join(__dirname,'.qa','host-'+size[0]+'.png'),(await win.webContents.capturePage()).toPNG());}
  fs.writeFileSync(path.join(__dirname,'.qa','host-results.json'),JSON.stringify({...result,viewports:true}));app.exit(0);
 }catch(error){fs.writeFileSync(path.join(__dirname,'.qa','host-results.json'),JSON.stringify({error:error.stack}));app.exit(1);}
});
