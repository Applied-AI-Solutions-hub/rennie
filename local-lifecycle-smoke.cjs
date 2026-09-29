const {app,BrowserWindow,ipcMain,dialog,net}=require('electron'),fs=require('fs'),path=require('path');
const profile=path.join(__dirname,'.qa','local-close-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
net.fetch=async()=>{throw Error('Offline fixture');};
require('./local-model.cjs').createLocalSetup=()=>({get:()=>({phase:'downloading-model',busy:true,model:'llama3.2:1b'}),status:async()=>({ok:false}),invalidate:()=>{}});
let prompts=0;dialog.showMessageBoxSync=()=>++prompts===1?0:1;
require('./main');
for(const name of ['metrics','setup-check'])ipcMain.removeHandler(name);
ipcMain.handle('metrics',()=>({memoryTotal:8e9}));ipcMain.handle('setup-check',()=>({wsl:{distributions:[]}}));
const timeout=setTimeout(()=>app.exit(1),5000);
app.on('will-quit',()=>{clearTimeout(timeout);if(prompts!==2){app.exit(1);return;}fs.writeFileSync(path.join(__dirname,'.qa','local-lifecycle.json'),JSON.stringify({keepSetupOpen:true,explicitExit:true}));});
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 await new Promise(r=>setTimeout(r,300));win.close();
 if(win.isDestroyed()||prompts!==1){app.exit(1);return;}
 win.close();
});
