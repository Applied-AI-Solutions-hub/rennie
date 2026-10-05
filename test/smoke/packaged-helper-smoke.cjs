const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
app.whenReady().then(()=>{try{
 const archive=path.resolve(process.argv[2]||'release/win-unpacked/resources/app.asar');
 if(!fs.existsSync(archive))throw Error('Build the packaged app before this test.');
 const root=fs.mkdtempSync(path.resolve('.qa/packaged-helper-'));
 const {materialize}=require(path.join(archive,'src/external-helper.cjs'));
 const helper=materialize(root,'openclaw-cancel.mjs');if(helper.includes('app.asar'))throw Error('Helper remained inside asar');
 const pkg=path.join(root,'node_modules/openclaw');fs.mkdirSync(pkg,{recursive:true});
 fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'openclaw',type:'module',exports:{'./plugin-sdk/gateway-runtime':'./sdk.mjs'}}));
 fs.writeFileSync(path.join(pkg,'sdk.mjs'),`export async function callGatewayFromCli(method,options,params){if(method!=='chat.abort'||params.sessionKey!=='agent:main:packaged')throw Error('Wrong RPC');return {aborted:true};}`);
 const entry=path.join(pkg,'openclaw.mjs');fs.writeFileSync(entry,'');
 const result=spawnSync('node',[helper,entry,'agent:main:packaged'],{encoding:'utf8',windowsHide:true});
 if(result.status!==0||JSON.parse(result.stdout).aborted!==true)throw Error(result.stderr||'Packaged helper failed');
 fs.writeFileSync(helper,'tampered');if(!fs.readFileSync(materialize(root,'openclaw-cancel.mjs')).equals(fs.readFileSync(path.join(archive,'src/openclaw-cancel.mjs'))))throw Error('Helper repair failed');
 console.log('Packaged helper executes through external Node and repairs a changed copy.');app.exit(0);
 }catch(error){console.error(error);app.exit(1);}});
