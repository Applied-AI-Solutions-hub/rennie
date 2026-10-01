const {app,ipcMain,safeStorage,shell,net}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {createChecker,releasesUrl}=require('./updates');
module.exports=function register(getWindow){
  const tokenFile=()=>path.join(app.getPath('userData'),'github-release-access.json');
  const readToken=()=>{
    if(!fs.existsSync(tokenFile()))return null;
    if(!safeStorage.isEncryptionAvailable())throw Error('Secure storage unavailable');
    return safeStorage.decryptString(Buffer.from(JSON.parse(fs.readFileSync(tokenFile(),'utf8')).encrypted,'base64'));
  };
  const checker=createChecker({current:app.getVersion(),fetchImpl:(...args)=>net.fetch(...args),onChange:value=>{
    const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('updates',value);
  }});
  ipcMain.handle('updates-state',()=>({...checker.get(),hasAccess:fs.existsSync(tokenFile())}));
  ipcMain.handle('updates-check',()=>checker.check());
  ipcMain.handle('updates-save-access',async(_,token)=>{
    if(typeof token!=='string'||!/^github_pat_[A-Za-z0-9_]{20,250}$/.test(token.trim()))throw Error('Enter a fine-grained GitHub personal access token.');
    if(!safeStorage.isEncryptionAvailable())throw Error('Windows secure storage is unavailable. Access was not saved.');
    fs.mkdirSync(path.dirname(tokenFile()),{recursive:true});
    const encrypted=safeStorage.encryptString(token.trim()).toString('base64');
    fs.writeFileSync(tokenFile()+'.tmp',JSON.stringify({encrypted}),{mode:0o600});fs.renameSync(tokenFile()+'.tmp',tokenFile());
    return checker.check();
  });
  ipcMain.handle('updates-remove-access',()=>{fs.rmSync(tokenFile(),{force:true});return checker.check();});
  ipcMain.handle('updates-open',()=>shell.openExternal(checker.get().releaseUrl||releasesUrl));
  ipcMain.handle('updates-access-help',()=>shell.openExternal('https://github.com/settings/personal-access-tokens'));
  app.whenReady().then(()=>checker.check());
  app.on('second-instance',()=>checker.check());
  return checker;
};
