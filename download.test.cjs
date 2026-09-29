const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {download}=require('./download.cjs');
const bytes=text=>new TextEncoder().encode(text);
function dir(){fs.mkdirSync(path.join(__dirname,'.qa'),{recursive:true});return fs.mkdtempSync(path.join(__dirname,'.qa','download-'));}
// A body that sends `first`, then goes silent until the stall watchdog aborts it.
const silentAfter=(signal,first)=>new ReadableStream({start(c){c.enqueue(bytes(first));signal.addEventListener('abort',()=>c.error(new Error('aborted')));}});
test('a stalled transfer resumes from the partial file with a Range request',async()=>{
 const target=path.join(dir(),'setup.exe'),requests=[];
 const fetchImpl=async(url,{signal,headers})=>{requests.push(headers.range||null);
  if(requests.length===1)return new Response(silentAfter(signal,'hello'),{headers:{'content-length':'10'}});
  return new Response('world',{status:206,headers:{'content-range':'bytes 5-9/10','content-length':'5'}});};
 const result=await download({url:'https://example.test/setup.exe',target,fetchImpl,stallMs:200,wait:async()=>{}});
 assert.deepEqual(requests,[null,'bytes=5-']);assert.equal(result.attempts,2);
 assert.equal(fs.readFileSync(target,'utf8'),'helloworld');assert.equal(fs.existsSync(target+'.part'),false);
});
test('raw bytes are requested, and a compressed response is not measured against its compressed size',async()=>{
 const target=path.join(dir(),'install.ps1');let asked;
 // GitHub gzips text files: Content-Length is the compressed size while the body arrives decompressed.
 await download({url:'u',target,wait:async()=>{},fetchImpl:async(_,{headers})=>{asked=headers['accept-encoding'];return new Response('0123456789',{headers:{'content-encoding':'gzip','content-length':'4'}});}});
 assert.equal(asked,'identity');assert.equal(fs.readFileSync(target,'utf8'),'0123456789');
});
test('a server that ignores Range restarts the file instead of appending a second copy',async()=>{
 const target=path.join(dir(),'setup.exe');fs.writeFileSync(target+'.part','hel');
 await download({url:'u',target,fetchImpl:async()=>new Response('helloworld',{headers:{'content-length':'10'}}),wait:async()=>{}});
 assert.equal(fs.readFileSync(target,'utf8'),'helloworld');
});
test('there is no total time limit: a slow but steady transfer completes',async()=>{
 let clock=0;const target=path.join(dir(),'slow.bin');
 const body=new ReadableStream({async pull(c){clock+=10*60*1000;if(clock>3*60*60*1000){c.close();return;}c.enqueue(bytes('x'));}});
 const result=await download({url:'u',target,fetchImpl:async()=>new Response(body),now:()=>clock,stallMs:1000,wait:async()=>{}});
 assert.equal(result.attempts,1);assert.ok(fs.statSync(target).size>=17,'three simulated hours of trickle still succeed');
});
test('permanent errors fail at once; transient ones retry up to the limit',async()=>{
 let calls=0;
 await assert.rejects(download({url:'u',target:path.join(dir(),'a'),fetchImpl:async()=>{calls++;return new Response('',{status:404});},wait:async()=>{}}),e=>e.reason==='http');
 assert.equal(calls,1);
 calls=0;const retries=[];
 await assert.rejects(download({url:'u',target:path.join(dir(),'b'),attempts:3,onProgress:p=>p.retrying&&retries.push(p.reason),fetchImpl:async(_,{signal})=>{calls++;return new Response(silentAfter(signal,'x'));},stallMs:10,wait:async()=>{}}),e=>e.reason==='stalled');
 assert.equal(calls,3);assert.deepEqual(retries,['stalled','stalled']);
});
test('an oversized download is refused before or during transfer',async()=>{
 await assert.rejects(download({url:'u',target:path.join(dir(),'c'),maxBytes:5,fetchImpl:async()=>new Response('toolong',{headers:{'content-length':'7'}}),wait:async()=>{}}),e=>e.reason==='size');
 await assert.rejects(download({url:'u',target:path.join(dir(),'d'),maxBytes:5,fetchImpl:async()=>new Response('toolong'),wait:async()=>{}}),e=>e.reason==='size');
});
