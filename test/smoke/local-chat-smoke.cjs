const {app,BrowserWindow,net}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'..','..','.qa',process.env.RENNIE_TEST_LIVE==='1'?'chat-live-reopen':'chat-context-'+Date.now());fs.mkdirSync(root,{recursive:true});app.setPath('userData',root);
// The llama.cpp engine folder is shared between profiles, so the test gets its own.
process.env.LOCALAPPDATA=path.join(root,'localappdata');
// As setup leaves it: the server's key, created when the server was first started.
fs.mkdirSync(path.join(root,'localappdata','Rennie','engine'),{recursive:true});fs.writeFileSync(path.join(root,'localappdata','Rennie','engine','server-key.txt'),require('crypto').randomBytes(32).toString('hex'));
net.fetch=async()=>{throw Error('Offline update fixture');};
const nativeFetch=global.fetch,live=process.env.RENNIE_TEST_LIVE==='1';
const requests=[];global.fetch=async(url,options)=>{
 // Direct chat goes to Rennie's llama.cpp server with this install's key.
 if(url==='http://127.0.0.1:18080/v1/chat/completions'){const body=JSON.parse(options.body);requests.push(body);assert.match(options.headers.authorization,/^Bearer [0-9a-f]{64}$/);assert.doesNotMatch(body.messages[0].content,/Applied|HomePC|(?:rennie|foxsocket)-graph|Bonsai/);if(live)return nativeFetch(url,options);return Response.json({model:body.model,choices:[{message:{content:body.messages.at(-1).content.includes('only the word blue')?'blue':'7 plus 5 is 12.'}}]});}
 throw Error('Unexpected request '+url);
};
require('../../src/main');
app.whenReady().then(async()=>{try{
 const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 await new Promise(r=>setTimeout(r,200));
 const graphFile=path.join(root,'agent/GRAPH.json');const before=fs.readFileSync(graphFile,'utf8');
 for(let i=0;i<2;i++){
  if(i){win.reload();await new Promise(r=>win.webContents.once('did-finish-load',r));await new Promise(r=>setTimeout(r,200));}
  await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-page=chat]').click();const input=document.querySelector('#chat-input');input.value='This is an installation test. What is 7 plus 5? Answer in one short sentence.';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-form').requestSubmit();let state;for(let n=0;n<900;n++){await new Promise(r=>setTimeout(r,200));state=await desktop.invoke('state');if(state.chat.at(-1)?.role==='assistant'||state.chat.at(-1)?.role==='error')break;}if(!/12|twelve/i.test(state.chat.at(-1).text))throw Error('Missing chat reply: '+state.chat.at(-1).text);const next=document.querySelector('#chat-input');next.value='Reply with only the word blue.';next.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-form').requestSubmit();for(let n=0;n<900;n++){await new Promise(r=>setTimeout(r,200));state=await desktop.invoke('state');if(state.chat.at(-1)?.role==='assistant'||state.chat.at(-1)?.role==='error')break;}if(state.chat.at(-1).text.trim().toLowerCase().replace(/[.!]$/,'')!=='blue')throw Error('Instruction failed: '+state.chat.at(-1).text);})()`);
 }
 assert.equal(requests.length,4);assert.ok(requests.every(r=>r.model==='qwen3.5-4b'),'the engine’s model is used');if(!live)assert.equal(requests[0].messages.length,2);assert.equal(requests[1].messages.at(-1).role,'user');assert.equal(fs.readFileSync(graphFile,'utf8'),before);
 assert.match(JSON.parse(fs.readFileSync(path.join(root,'state.json'))).chat.at(-1).text,/^blue[.!]?$/i);
 fs.writeFileSync(path.join(__dirname,live?'../../.qa/local-chat-live-results.json':'../../.qa/local-chat-results.json'),JSON.stringify({liveModel:live,realHandler:true,serializedPrompt:true,persistedReply:true,reload:true,noAutomaticMemory:true}));app.exit(0);
 }catch(e){console.error(e);app.exit(1);}});
