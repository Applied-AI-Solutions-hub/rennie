const {app,BrowserWindow,ipcMain,net}=require('electron'),fs=require('fs'),path=require('path');
const preparing=process.argv.includes('--preparing');
const profile=path.join(__dirname,'.qa','lifecycle-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
net.fetch=async()=>{throw Error('Offline fixture');};
let publish,aliveDuringPreparation=false;
const job={phase:preparing?'startup':'idle',busy:preparing,operation:preparing?'prepare':'check'};
require('./host-manager').createManager=options=>{publish=options.onChange;return {get:()=>job,check:async()=>job,prepare:async()=>job};};
require('./main');
for(const name of ['gateway','metrics'])ipcMain.removeHandler(name);
ipcMain.handle('gateway',()=>({ok:false}));ipcMain.handle('metrics',()=>({memoryTotal:16e9}));
const timeout=setTimeout(()=>{fs.writeFileSync(path.join(__dirname,'.qa','lifecycle-error.json'),JSON.stringify({error:'App did not exit'}));app.exit(1);},5000);
app.on('will-quit',()=>{clearTimeout(timeout);if(preparing&&!aliveDuringPreparation){app.exit(1);return;}fs.writeFileSync(path.join(__dirname,'.qa','lifecycle-'+(preparing?'preparing':'normal')+'.json'),JSON.stringify({exited:true,backgroundPreparation:preparing,aliveDuringPreparation}));});
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 if(preparing)setTimeout(()=>{aliveDuringPreparation=true;job.busy=false;job.phase='ready';publish(job);},300);
 win.close();
});
