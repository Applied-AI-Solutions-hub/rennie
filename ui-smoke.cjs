const {app,BrowserWindow,ipcMain,session}=require('electron');
const fs=require('fs'),path=require('path');
const qa=path.join(__dirname,'.qa');fs.mkdirSync(qa,{recursive:true});
app.setPath('userData',path.join(qa,'test-profile'));
const errors=[];app.on('web-contents-created',(_,wc)=>{wc.on('console-message',(_,level,msg)=>{if(level>=3)errors.push(msg)});wc.on('render-process-gone',(_,d)=>errors.push(d.reason));});
require('./main.js');
let folderCalls=0;
ipcMain.removeHandler('folder');
ipcMain.handle('folder',async()=>{folderCalls++;await new Promise(r=>setTimeout(r,450));throw Error('Expected test cancellation');});
app.whenReady().then(async()=>{
 let failed=false;const network=[];session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,cb)=>{network.push(d.url);cb({cancel:true})});
 await new Promise(r=>setTimeout(r,3500));const win=BrowserWindow.getAllWindows()[0];
 try{
 win.unmaximize();win.setContentSize(1536,1024);await new Promise(r=>setTimeout(r,500));
 fs.writeFileSync(path.join(qa,'home-1536.png'),(await win.webContents.capturePage()).toPNG());
 const result=await win.webContents.executeJavaScript(`(async()=>{
 const check=(b,m)=>{if(!b)throw Error(m)};
 check(document.title==='Agent Workspace','Brand window title');
 const originalBrand=window.productBrand;
 for(const candidate of ['Sidekick','Relay']){window.productBrand={...originalBrand,productName:candidate};window.applyProductBrand();check(document.querySelector('.brand [data-brand=productName]').textContent===candidate,'Candidate brand');}
 window.productBrand=originalBrand;window.applyProductBrand();
 check(!!window.appEffects,'Effects bundle');check(!!customElements.get('wa-button'),'Web Awesome registered');
 check(![...document.images].some(i=>!i.complete||!i.naturalWidth),'Missing image');
 check(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
 for(const route of ['Sparky','Tasks','Devices','Files','System','Settings','Home']){document.querySelector('nav [data-page="'+route+'"]').click();check(document.querySelector('#content').textContent.trim().length>20,'Blank '+route)}
 document.querySelector('[data-page=Tasks]').click();document.querySelector('#task-input').value='Design verification task';document.querySelector('#task-form').requestSubmit();await new Promise(r=>setTimeout(r,150));check(document.querySelector('.task .label').textContent==='Design verification task','Task add');document.querySelector('[data-task]').click();await new Promise(r=>setTimeout(r,150));check(document.querySelector('.task.done'),'Task complete');document.querySelector('[data-delete]').click();await new Promise(r=>setTimeout(r,150));check(!document.querySelector('.task'),'Task delete');
 document.querySelector('[data-page=Home]').click();document.querySelector('#timer-toggle').click();await new Promise(r=>setTimeout(r,150));check(document.querySelector('#timer-toggle').textContent.includes('Stop'),'Timer start');document.querySelector('#timer-toggle').click();await new Promise(r=>setTimeout(r,150));
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));check(document.querySelector('#chat-input'),'Command shortcut');document.querySelector('[data-page=Home]').click();
 const folder=document.querySelector('#add-folder');await folder.updateComplete;const width=folder.getBoundingClientRect().width;folder.click();await new Promise(r=>setTimeout(r,60));check(folder.loading,'Loading state');check(Math.abs(folder.getBoundingClientRect().width-width)<2,'Loading layout shift');folder.click();await new Promise(r=>setTimeout(r,550));check(!folder.loading,'Loading reset after error');
 const taskNav=document.querySelector('nav [data-page=Tasks]');taskNav.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));await new Promise(r=>setTimeout(r,250));check(getComputedStyle(taskNav).transform==='none','Press transform cleaned up');
 document.querySelector('nav [data-page=Settings]').click();await new Promise(r=>setTimeout(r,350));
 const toggle=document.querySelector('#interface-motion');await toggle.updateComplete;toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));check(document.documentElement.dataset.motion==='off','Motion off');document.querySelector('nav [data-page=Home]').click();check(document.querySelector('#content').getAnimations().length===0,'Reduced motion navigation');document.querySelector('nav [data-page=Settings]').click();check(!document.querySelector('#interface-motion').checked,'Preference retained');
 document.querySelector('#interface-motion').checked=true;document.querySelector('#interface-motion').dispatchEvent(new Event('change',{bubbles:true}));await document.querySelector('#replay-motion').updateComplete;document.querySelector('#replay-motion').click();await new Promise(r=>setTimeout(r,150));check(document.querySelector('.brand-mark').style.transform.includes('scale'),'Anime logo animation');await new Promise(r=>setTimeout(r,1000));check(!document.querySelector('.brand-mark').style.transform,'Logo cleanup');
 document.querySelector('nav [data-page=Home]').click();check(document.querySelector('#content').getAnimations().length>0,'Motion entrance animation');await new Promise(r=>setTimeout(r,1100));
 return {navigation:true,tasks:true,timer:true,commandShortcut:true,images:true,metrics:!!document.querySelector('#home-system').textContent.includes('%'),webAwesomeLoading:true,loadingErrorRecovery:true,motionPreference:true,motionEntrance:true,animeWelcome:true,pressCleanup:true};})().catch(e=>{throw new Error(e.stack)})`);
 await win.webContents.executeJavaScript(`document.querySelector('nav [data-page=Settings]').click()`);
 await new Promise(r=>setTimeout(r,400));
 await win.webContents.executeJavaScript(`document.querySelector('#interface-motion').focus()`);
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
 await new Promise(r=>setTimeout(r,150));
 result.keyboardSwitch=await win.webContents.executeJavaScript(`document.documentElement.dataset.motion==='off'`);
 if(!result.keyboardSwitch)throw Error('Keyboard switch');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
 await new Promise(r=>setTimeout(r,150));
 fs.writeFileSync(path.join(qa,'settings.png'),(await win.webContents.capturePage()).toPNG());
 win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await new Promise(r=>setTimeout(r,150));
 result.systemReducedMotion=await win.webContents.executeJavaScript(`document.documentElement.dataset.motion==='off' && !window.appEffects.permitsMotion()`);
 if(!result.systemReducedMotion)throw Error('System reduced motion');
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach();
 await win.webContents.executeJavaScript(`document.querySelector('nav [data-page=Home]').click()`);
 await new Promise(r=>setTimeout(r,1100));
 win.setContentSize(1000,720);await new Promise(r=>setTimeout(r,500));
 result.viewport=await win.webContents.executeJavaScript("({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})");result.narrowOverflow=await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth');
 fs.writeFileSync(path.join(qa,'home-1000.png'),(await win.webContents.capturePage()).toPNG());
 result.folderCalls=folderCalls;result.externalRequests=network;result.consoleErrors=errors;fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify(result,null,2));
 }catch(e){failed=true;fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify({error:e.stack,page:await win.webContents.executeJavaScript('document.body.dataset.page'),content:await win.webContents.executeJavaScript('document.querySelector("#content").innerHTML.slice(0,1500)'),errors},null,2));}finally{app.exit(failed?1:0)}
});





