const {test}=require('node:test'),assert=require('node:assert/strict');
const {compare,version,selectRelease,createChecker,repository}=require('./updates');
const release=(tag,extra={})=>({tag_name:tag,assets:[{name:'Setup.exe',state:'uploaded',size:10}],...extra});
const response=(status,data,headers={})=>({status,ok:status===200,headers:{get:key=>headers[key]},json:async()=>data});
test('semantic versions compare numeric components and prereleases, not strings',()=>{
 for(const [a,b] of [['0.10.0','0.9.0'],['0.6.0','0.6.0-alpha.9'],['0.6.0-alpha.10','0.6.0-alpha.2'],['1.0.0-beta','1.0.0-2']])assert.equal(compare(a,b),1);
 assert.equal(compare('v1.2.3+local','1.2.3'),0);assert.equal(version('1.2.3-01'),null);assert.equal(version('https://evil/1.2.3'),null);
});
test('stable installs skip previews, drafts and releases without completed installers',()=>{
 const list=[release('9.0.0',{draft:true}),release('8.0.0-beta',{prerelease:true}),release('7.0.0',{assets:[]}),release('6.0.0',{assets:[{name:'Setup.exe',state:'new',size:1}]}),release('1.0.0')];
 assert.equal(selectRelease(list,'0.5.0').tag_name,'1.0.0');assert.equal(selectRelease(list,'0.6.0-alpha.1').tag_name,'8.0.0-beta');
});
test('new release link is constructed from the configured repository',async()=>{
 const checker=createChecker({current:'0.6.0-alpha.1',fetchImpl:async()=>response(200,[release('v0.6.0-alpha.2',{html_url:'https://evil.example'})])});
 const result=await checker.check();assert.equal(result.status,'available');assert.equal(result.releaseUrl,`https://github.com/${repository}/releases/tag/v0.6.0-alpha.2`);assert.ok(checker.get().checkedAt);
});
test('private access failures, offline failures and rate limits never report up to date',async()=>{
 for(const [status,expected] of [[401,'access-required'],[404,'access-required'],[429,'rate-limited'],[500,'unavailable']])assert.equal((await createChecker({current:'1.0.0',fetchImpl:async()=>response(status,null)}).check()).status,expected);
 assert.equal((await createChecker({current:'1.0.0',fetchImpl:async()=>{throw Error('secret must not surface')}}).check()).status,'unavailable');
});
test('current or newer local versions are not offered a downgrade',async()=>{
 assert.equal((await createChecker({current:'0.7.0',fetchImpl:async()=>response(200,[release('0.6.0')])}).check()).status,'current');
});
test('checks coalesce, authenticate only the fixed API, and do not expose tokens',async()=>{
 let calls=0;const snapshots=[];
 const checker=createChecker({current:'1.0.0',readToken:()=> 'private-token',onChange:s=>snapshots.push(s),fetchImpl:async(url,options)=>{calls++;assert.ok(url.startsWith(`https://api.github.com/repos/${repository}/releases?`));assert.equal(options.headers.Authorization,'Bearer private-token');assert.equal(options.redirect,'error');return response(200,[]);}});
 await Promise.all([checker.check(),checker.check()]);assert.equal(calls,1);assert.equal(checker.get().status,'no-releases');assert.ok(!JSON.stringify(snapshots).includes('private-token'));
});
test('timeout and malformed data are recoverable',async()=>{
 const checker=createChecker({current:'1.0.0',timeoutMs:10,fetchImpl:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))))});
 assert.equal((await checker.check()).status,'unavailable');assert.equal((await createChecker({current:'1.0.0',fetchImpl:async()=>response(200,{})}).check()).status,'unavailable');
});
