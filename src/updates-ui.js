(()=>{
  let current={status:'idle'};
  const descriptions={idle:'A release check runs each time you open the app.',checking:'Checking GitHub releases…',current:'You have the newest compatible release, or a newer local build.',available:'A newer version is ready to download.', 'access-required':'GitHub rejected the release check. Try again later.','rate-limited':'GitHub has temporarily limited requests. Try again later.',unavailable:'Could not check GitHub. Your workspace is still available.','no-releases':'No compatible published Windows installers were found.'};
  function paint(){
    let notice=document.querySelector('#release-notice');
    if(!notice){notice=document.createElement('button');notice.id='release-notice';notice.className='release-notice';notice.onclick=()=>window.desktop.invoke('updates-open');document.querySelector('.center').prepend(notice);}
    notice.hidden=current.status!=='available';notice.textContent=`Version ${current.latest||''} available · View release`;
    if(document.body.dataset.page!=='settings')return;
    const content=document.querySelector('#content .page-inner')||document.querySelector('#content');
    let panel=document.querySelector('#release-settings');
    if(!panel){panel=document.createElement('section');panel.id='release-settings';panel.className='panel';panel.innerHTML=`<h2>App updates</h2><p id="release-status" role="status"></p><small id="release-details"></small><div class="actions"><button data-update="check">Check now</button><button data-update="open">View releases</button></div><small>Rennie checks public GitHub releases. No GitHub account or token is needed.</small>`;content.append(panel);}
    panel.querySelector('#release-status').textContent=descriptions[current.status]||descriptions.unavailable;
    panel.querySelector('#release-details').textContent=`Installed: ${current.current||'—'} · ${current.channel||'Release'} channel${current.checkedAt?' · Checked '+new Date(current.checkedAt).toLocaleTimeString():''}`;
    panel.querySelector('[data-update=check]').disabled=current.status==='checking';
  }
  async function update(action,arg){try{current=await window.desktop.invoke(action,arg);paint();}catch(error){const p=document.querySelector('#release-status');if(p)p.textContent=error.message;}}
  document.addEventListener('click',event=>{const b=event.target.closest('[data-update]');if(!b)return;const action=b.dataset.update;if(action==='check')update('updates-check');if(action==='remove')update('updates-remove-access');if(action==='open')window.desktop.invoke('updates-open');if(action==='help')window.desktop.invoke('updates-access-help');});
  document.addEventListener('submit',event=>{if(event.target.id!=='release-access-form')return;event.preventDefault();const input=document.querySelector('#release-token'),token=input.value;input.value='';update('updates-save-access',token);});
  window.releaseUpdates={render:paint};
  window.desktop.onUpdates(value=>{current=value;paint();});
  window.desktop.invoke('updates-state').then(value=>{current=value;paint();}).catch(()=>{});
})();
