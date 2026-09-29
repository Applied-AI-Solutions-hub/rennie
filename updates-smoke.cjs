const {app,BrowserWindow,net}=require('electron'),fs=require('fs'),path=require('path');
const profile=path.join(__dirname,'.qa','updates-'+Date.now());fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
let calls=0;
const nextVersion='99.0.0';
net.fetch=async()=>{calls++;return calls===1?new Response(JSON.stringify([{tag_name:'v'+nextVersion,assets:[{name:'Setup.exe',state:'uploaded',size:100}]}]),{status:200}):new Response('{}',{status:404});};
app.getVersion=()=>require('./package.json').version;
require('./main');
app.whenReady().then(async()=>{
 try{
 const win=BrowserWindow.getAllWindows()[0];await new Promise(r=>win.webContents.isLoading()?win.webContents.once('did-finish-load',r):r());
 await new Promise(r=>setTimeout(r,250));
 const result=await win.webContents.executeJavaScript(`(async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));
 const info=await desktop.invoke('updates-state');check(!document.querySelector('#release-notice').hidden,'Startup update notice: '+JSON.stringify(info));
 check(document.querySelector('#release-notice').textContent.includes('${nextVersion}'),'New release version');
 document.querySelector('[data-page=settings]').click();
 check(document.querySelector('#release-status').textContent.includes('newer version'),'Settings available state');
 document.querySelector('[data-update=check]').click();await wait(100);
 check(document.querySelector('#release-status').textContent.includes('rejected'),'Private access state');
 check(document.querySelector('#release-notice').hidden,'Old update notice cleared after failed check');
 check(!document.querySelector('#release-token'),'Public updates do not request credentials');
 return {startupCheck:true,newVersionNotice:true,manualCheck:true,publicAccessFailure:true,noCredentialField:true};})()`);
 if(calls!==2)throw Error('Expected one startup request and one manual request, got '+calls);
 fs.writeFileSync(path.join(__dirname,'.qa','updates-results.json'),JSON.stringify(result,null,2));app.exit(0);
 }catch(error){console.error(error.message);app.exit(1);}
});
