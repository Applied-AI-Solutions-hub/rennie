(() => {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const bytes=n=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(1)+' MB';
 const gb=n=>Number.isFinite(n)?(Math.round(n/1024**3*10)/10).toString():'?';
 // Plain-language steps. Each maps to the setup phases it covers, so a failure
 // can point at the exact step that stopped instead of a generic error.
 const OPENCLAW_STAGES=[
  ['Install and set up OpenClaw, your assistant',['installing-openclaw','configuring-openclaw','starting-openclaw']],
  ['Get a first reply through OpenClaw',['verifying-openclaw']],
 ];
 const ENGINE_STAGES={
  ollama:[
   ['Install Ollama, which runs the AI model',['downloading-runtime','checking-installer','installing-runtime','starting']],
   ['Download the AI model',['downloading-model']],
   ['Check that the model answers',['verifying']]],
  // The llama.cpp server starts only once the model is on disk, so starting belongs with the reply check.
  llama:[
   ['Download the llama.cpp engine, which runs the AI model',['downloading-engine','unpacking-engine']],
   ['Download the AI model',['downloading-model']],
   ['Start the model and check that it answers',['starting','verifying']]],
 };
 const stagesFor=engine=>[['Check this PC',['checking']],...(ENGINE_STAGES[engine]||ENGINE_STAGES.ollama),...OPENCLAW_STAGES];
 // The last two steps are OpenClaw's; a failure there offers OpenClaw doctor.
 const OPENCLAW_PHASES=OPENCLAW_STAGES.flatMap(([,phases])=>phases);
 const doctorButton=busy=>`<button data-action="openclaw-doctor" ${busy?'disabled':''}>${busy?'Running OpenClaw doctor…':'Run OpenClaw doctor'}</button>`;
 function stages(local){
  const STAGES=stagesFor(local.engine);
  const at=phase=>STAGES.findIndex(([,phases])=>phases.includes(phase));
  const current=local.phase==='attention'?at(local.failedPhase):at(local.phase);
  return `<ol class="setup-stages">${STAGES.map(([label],i)=>{
   const done=local.phase==='ready'||(current>=0&&i<current);
   const failed=local.phase==='attention'&&i===current;
   const active=local.busy&&i===current;
   const mark=done?'Done':failed?'Stopped here':active?'In progress':'';
   return `<li class="${done?'done':failed?'failed':active?'active':''}" ${active||failed?'aria-current="step"':''}><span>${esc(label)}</span>${mark?`<small>${mark}</small>`:''}</li>`;}).join('')}</ol>`;
 }
 function doctorView(doctor,busy){
  if(!doctor)return '';
  const findings=doctor.findings||[];
  return `<section class="panel" id="openclaw-doctor"><h2>OpenClaw doctor</h2><p>${findings.length?`OpenClaw checked itself and found ${findings.length} item${findings.length===1?'':'s'} to look at.`:'OpenClaw checked itself and found nothing to fix.'}${doctor.checksRun!=null?` (${doctor.checksRun} checks run${doctor.checksSkipped?', '+doctor.checksSkipped+' not applicable':''}.)`:''}</p>
   ${findings.map(f=>`<div class="finding ${esc(f.severity)}"><strong>${esc(f.severity==='error'?'Needs fixing':f.severity==='warning'?'Worth a look':'Note')}${f.target?' · '+esc(f.target):''}</strong><p>${esc(f.message)}</p>${f.fixHint?`<details><summary>How to fix</summary><p>${esc(f.fixHint)}</p></details>`:''}</div>`).join('')}
   ${findings.length?`<p>OpenClaw’s own repair tool can fix many of these. It may update OpenClaw settings and restart its gateway; your conversations are kept. Some items, like connecting accounts, still need you.</p><div class="actions"><button class="primary" data-action="openclaw-repair" ${busy?'disabled':''}>${busy?'Repairing…':'Let OpenClaw fix what it can'}</button></div>`:''}</section>`;
 }
 window.localSetupView=({local,pc,choice,models,doctor,doctorBusy})=>{
  const total=local.total, completed=local.completed||0;
  const pct=total?Math.min(100,Math.floor(100*completed/total)):null;
  const busy=!!local.busy,ready=local.verified===true&&local.phase==='ready'&&local.model===choice;
  const known=models.some(m=>m.id===choice);
  const llama=local.engine==='llama';
  const recommended=pc?.recommended&&(llama||pc.recommended!==models[0]?.id)?models.find(m=>m.id===pc.recommended):null;
  const openclawTrouble=local.phase==='attention'&&OPENCLAW_PHASES.includes(local.failedPhase);
  return `<div class="page-intro"><h1>${ready?'Your assistant is ready':'Set up your assistant on this PC'}</h1><p>Rennie installs and connects everything for you: <strong>${llama?'llama.cpp':'Ollama'}</strong> runs the AI model on this PC, and <strong>OpenClaw</strong> is the assistant that uses it. No API key is required, and there are no accounts to create or commands to type.</p></div>
   <section class="panel"><h2>1. This PC</h2>${pc?`<p>${gb(pc.totalMemory)} GB of memory · ${gb(pc.freeBytes)} GB of free space. ${pc.modelKnown===false?`Setup will download the model${pc.download?` and about ${gb(pc.download)} GB more`:''}, so a steady internet connection helps.`:pc.download?`Setup will download about ${gb(pc.download)} GB, so a steady internet connection helps.`:'Everything setup needs is already on this PC.'}</p>${pc.enoughSpace?'':`<div class="notice" role="alert">${esc(pc.problem)}</div>`}${pc.caution?`<div class="notice">${esc(pc.caution)}</div>`:''}`:'<p>Checking this PC…</p>'}</section>
   <section class="panel"><h2>2. Name your assistant <small>(optional)</small></h2><label class="field">Assistant name<input id="local-agent-name" value="${esc(local.agentName||'')}" maxlength="40" placeholder="My assistant" ${busy?'disabled':''}></label><p>The name is saved in OpenClaw. If OpenClaw was already set up on this PC, its existing name and settings are kept.</p></section>
   <section class="panel"><h2>3. Choose the AI model</h2>${recommended?`<p><strong>For this PC${llama?'':'’s memory'} we recommend ${esc(recommended.label)}.</strong>${llama&&pc.recommendedReason?' '+esc(pc.recommendedReason)+'.':''}</p>`:''}${llama&&pc?.lowMemory?'<div class="notice">This PC has less than 8 GB of memory. The model will run, but slowly, and other apps may slow down while it answers.</div>':''}
   <label class="field">Model<select id="local-model" ${busy?'disabled':''}>${models.map(m=>`<option value="${esc(m.id)}" ${m.id===choice?'selected':''}>${esc(m.label)} — ${esc(m.download)}</option>`).join('')}${!known?`<option selected value="${esc(choice)}">${esc(choice)} (custom)</option>`:''}</select></label><p>${esc(pc?.backendReason||models.find(m=>m.id===choice)?.memory||'Quality depends on the selected model.')}</p>
   ${pc?.selectedBackend==='cuda'&&local.model===choice&&local.build!=='cuda'&&local.phase==='ready'?'<p>Your graphics card can run this model. Choose Check again to switch.</p>':''}
   ${local.development?'<div class="notice">Development test: direct model chat in a separate engine. Your installed assistant and OpenClaw settings are not changed.</div>':''}
   ${llama?'':`<details><summary>Use another on-device Ollama model</summary><label class="field">Model name<input id="local-custom-model" value="${esc(choice)}" maxlength="200" ${busy?'disabled':''}></label><p>OpenClaw needs a model with tool support and at least 16K context. Large models may exceed this PC’s memory.</p></details>`}
   <p>Models: <a href="#" data-local-license="true">${llama?'License and model information':'Llama 3.2 license and model information'}</a>. Downloads need internet; replies on this PC do not.</p>
   <button class="primary" data-action="prepare-local" ${busy||(pc&&!pc.enoughSpace)?'disabled':''}>${busy?'Setting up…':ready?'Check again':local.phase==='idle'?'Set up my assistant':'Resume setup'}</button></section>
   <section class="panel" id="local-setup-progress" tabindex="-1" aria-labelledby="local-progress-title"><h2 id="local-progress-title">4. Progress</h2><strong role="status">${esc(local.message||'Ready to start.')}</strong>${stages(local)}
   ${busy&&['downloading-runtime','installing-runtime'].includes(local.phase)?'<p>Ollama may open its own welcome window. No sign-in is needed there; come back to Rennie.</p>':''}
   ${busy&&local.phase==='installing-openclaw'?'<p>Windows may ask for permission to install Node.js, which OpenClaw needs. Choose Yes.</p>':''}
   ${busy?`<div class="local-progress"><progress aria-label="Current download or setup activity" ${pct===null?'':`max="100" value="${pct}"`}></progress><p>${pct===null?'Working — this step does not report a percentage.':`${bytes(completed)} of ${bytes(total)} · ${pct}%`}</p></div>`:''}
   ${local.error?`<div class="notice" role="alert"><strong>What happened:</strong> ${esc(local.error)}</div>`:''}
   ${local.phase==='attention'?`<div class="actions"><button class="primary" data-action="prepare-local">Resume setup</button>${openclawTrouble||local.backbone==='openclaw'?doctorButton(doctorBusy):''}</div>`:''}
   ${local.log?.length?`<details><summary>Technical details</summary><pre class="setup-log">${esc(local.log.join('\n'))}</pre></details>`:''}
   ${local.detail&&busy?`<details><summary>Details</summary><p>${esc(local.detail)}</p></details>`:''}
   ${local.reply?`<p>First reply: <q>${esc(local.reply)}</q></p>`:''}
   ${local.note?`<p>${esc(local.note)}</p>`:''}
   <p>${busy?'Keep Rennie open during setup. If you close it or restart, come back here to resume; finished downloads are kept.':'Your choices and last result are saved on this PC.'}</p>
   ${ready?`<div class="actions"><button class="primary" data-page="chat">Start a conversation</button>${local.backbone==='openclaw'?doctorButton(doctorBusy):''}</div>`:''}</section>
   ${doctorView(doctor,doctorBusy)}
   <section class="panel"><h2>Other options</h2><p>Hosted providers (ChatGPT, Claude, Grok) are in Models. Running OpenClaw inside Ubuntu (WSL) is for advanced users and needs Windows virtualization.</p><div class="actions"><button data-page="settings">Hosted provider settings</button><button data-action="legacy-host">Advanced: OpenClaw in Ubuntu</button></div></section>`;
 };
})();
