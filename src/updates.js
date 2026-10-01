// Release checks only. Never download or execute an update automatically.
const repository = 'Applied-AI-Solutions-hub/rennie';
const releasesUrl = `https://github.com/${repository}/releases`;
function version(value) {
  const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value || '');
  if (!m || m[4]?.split('.').some(x => /^\d+$/.test(x) && x.length > 1 && x[0] === '0')) return null;
  return { core: m.slice(1,4).map(BigInt), pre: m[4]?.split('.') || [] };
}
function compare(a,b) {
  a=version(a); b=version(b); if(!a||!b)throw Error('Invalid version');
  for(let i=0;i<3;i++)if(a.core[i]!==b.core[i])return a.core[i]>b.core[i]?1:-1;
  if(!a.pre.length||!b.pre.length)return a.pre.length===b.pre.length?0:a.pre.length?-1:1;
  for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++) {
    const x=a.pre[i], y=b.pre[i]; if(x===y)continue;
    if(x===undefined||y===undefined)return x===undefined?-1:1;
    const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);
    if(nx&&ny)return BigInt(x)>BigInt(y)?1:-1;
    if(nx!==ny)return nx?-1:1;
    return x>y?1:-1;
  } return 0;
}
function releaseLink(tag) { return `${releasesUrl}/tag/${encodeURIComponent(tag)}`; }
function selectRelease(releases,current) {
  const preview=!!version(current)?.pre.length;
  return releases.filter(r=>!r.draft&&version(r.tag_name)&&(preview||(!r.prerelease&&!version(r.tag_name).pre.length))&&
    Array.isArray(r.assets)&&r.assets.some(a=>a.state==='uploaded'&&/\.exe$/i.test(a.name)&&a.size>0))
    .sort((a,b)=>compare(b.tag_name,a.tag_name))[0] || null;
}
function createChecker({current,fetchImpl=fetch,readToken=()=>null,onChange=()=>{},timeoutMs=12000}) {
  let snapshot={status:'idle',current,channel:version(current)?.pre.length?'Preview and stable':'Stable',releasesUrl},pending;
  const emit=patch=>{snapshot={...snapshot,...patch};onChange(snapshot);return snapshot;};
  function check() {
    if(pending)return pending;
    emit({status:'checking',latest:null,releaseUrl:null});
    pending=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try {
        if(!version(current))return emit({status:'unavailable'});
        const token=await readToken();
        const headers={'Accept':'application/vnd.github+json','User-Agent':'Agent-Workspace-Release-Check','X-GitHub-Api-Version':'2022-11-28'};
        if(token)headers.Authorization=`Bearer ${token}`;
        let releases=[];
        for(let page=1;page<=3;page++) {
          const response=await fetchImpl(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,{headers,signal:controller.signal,redirect:'error'});
          if([401,404].includes(response.status))return emit({status:'access-required'});
          if(response.status===403||response.status===429)return emit({status:response.headers.get('x-ratelimit-remaining')==='0'||response.status===429?'rate-limited':'access-required'});
          if(!response.ok)throw Error('Unavailable');
          const data=await response.json();if(!Array.isArray(data))throw Error('Invalid release data');
          releases.push(...data);
          if(data.length<100)break;
          if(page===3)return emit({status:'unavailable'});
        }
        const latest=selectRelease(releases,current);
        if(!latest)return emit({status:'no-releases'});
        return emit({status:compare(latest.tag_name,current)>0?'available':'current',latest:latest.tag_name,releaseUrl:releaseLink(latest.tag_name)});
      } catch { return emit({status:'unavailable'}); }
      finally {clearTimeout(timer);snapshot={...snapshot,checkedAt:Date.now()};onChange(snapshot);pending=null;}
    })();return pending;
  }
  return {check,get:()=>snapshot};
}
module.exports={repository,releasesUrl,version,compare,selectRelease,createChecker};
