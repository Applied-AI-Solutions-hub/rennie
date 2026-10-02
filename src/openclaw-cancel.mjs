// Use the public SDK with the same local operator scope as `openclaw agent`.
// A separate generic CLI RPC uses a narrower scope and cannot own that run.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [entry,sessionKey]=process.argv.slice(2);
if(!entry||!/^agent:[\w.-]{1,80}:[\w.:-]{1,160}$/.test(sessionKey||''))throw Error('Invalid cancellation request.');
try{
 const require=createRequire(entry);
 const {callGatewayFromCli}=await import(pathToFileURL(require.resolve('openclaw/plugin-sdk/gateway-runtime')).href);
 const result=await callGatewayFromCli('chat.abort',{json:true,timeout:'20000'},{sessionKey},{scopes:['operator.admin'],progress:false});
 process.stdout.write(JSON.stringify(result));
}catch{process.stderr.write('OpenClaw could not confirm cancellation.');process.exitCode=1;}
