// Foxsocket engine lab: starts PrismML llama-server with one model and measures
// what the product decision needs. Usage:
//   node bench.cjs <name> <model.gguf> <gpu|cpu> [ctx=32768]
// Appends one JSON line per run to results.jsonl.
const {spawn,execFileSync}=require('child_process');const fs=require('fs'),path=require('path');
const LAB=__dirname,PORT=18080,BASE=`http://127.0.0.1:${PORT}`,KEY='lab-'+Date.now();
const [name,modelFile,mode='gpu',ctxArg]=process.argv.slice(2);const ctx=Number(ctxArg)||32768;
const exe=path.join(LAB,'bin',mode==='gpu'?'cuda':'cpu','llama-server.exe');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vram=()=>{try{return Number(execFileSync('nvidia-smi.exe',['--query-gpu=memory.used','--format=csv,noheader,nounits']).toString().trim());}catch{return null;}};
async function call(body,timeoutMs=300000){const t=Date.now();const r=await fetch(BASE+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+KEY},body:JSON.stringify({temperature:0.7,top_p:0.8,top_k:20,...body}),signal:AbortSignal.timeout(timeoutMs)});const j=await r.json();return {ms:Date.now()-t,status:r.status,j};}
// Ask for no thinking every way the templates understand: OpenAI-style and Qwen/Bonsai template kwargs.
const noThink={reasoning_effort:'none',chat_template_kwargs:{enable_thinking:false,reasoning_effort:'none'}};
const text=j=>String(j.choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim();
const arith=s=>/\b(12|twelve)\b/i.test(s)&&s.length<200,blue=s=>/^blue[.!]?$/i.test(s.trim());
(async()=>{
 const out={name,mode,ctx,model:path.basename(modelFile),at:new Date().toISOString()};
 const before=vram();const t0=Date.now();
 const args=['-m',modelFile,'--host','127.0.0.1','--port',String(PORT),'-c',String(ctx),'--jinja','-fa','on','-np','1','-ngl',mode==='gpu'?'99':'0','--api-key',KEY,'--reasoning-format','deepseek'];
 const log=fs.createWriteStream(path.join(LAB,`server-${name}-${mode}.log`));
 const srv=spawn(exe,args,{windowsHide:true});srv.stdout.pipe(log);srv.stderr.pipe(log);
 let exited=null;srv.on('exit',c=>exited=c);
 try{
  for(;;){if(exited!==null)throw Error('server exited with code '+exited+' (see log)');try{const h=await fetch(BASE+'/health');if(h.ok)break;}catch{}if(Date.now()-t0>600000)throw Error('load timeout');await sleep(500);}
  out.loadSeconds=+((Date.now()-t0)/1000).toFixed(1);out.vramMiB=mode==='gpu'&&before!=null?vram()-before:0;
  try{out.rssGB=+(Number(execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${srv.pid}).WorkingSet64`]).toString().trim())/1e9).toFixed(2);}catch{}
  const props=await (await fetch(BASE+'/props',{headers:{authorization:'Bearer '+KEY}})).json();
  out.caps=props.chat_template_caps||null;out.nCtx=props.default_generation_settings?.n_ctx??null;
  // 1. Speed, thinking off.
  const speed=await call({...noThink,max_tokens:256,messages:[{role:'user',content:'In about 120 words, explain why regular backups matter for a small business.'}]});
  out.genTokPerSec=+(speed.j.timings?.predicted_per_second||0).toFixed(1);out.promptTokPerSec=+(speed.j.timings?.prompt_per_second||0).toFixed(1);out.speedReplyChars=text(speed.j).length;out.speedLeakedThinking=/<think>|^(okay|alright|let me)\b/i.test(String(speed.j.choices?.[0]?.message?.content||''));
  // 2. The setup checks, single turn and two turns.
  const a=await call({...noThink,max_tokens:128,messages:[{role:'user',content:'This is an installation test. What is 7 plus 5? Answer in one short sentence.'}]});
  const b=await call({...noThink,max_tokens:128,messages:[{role:'user',content:'Reply with only the word blue.'}]});
  const m=await call({...noThink,max_tokens:128,messages:[{role:'user',content:'This is an installation test. What is 7 plus 5? Answer in one short sentence.'},{role:'assistant',content:text(a.j)||'The answer is 12.'},{role:'user',content:'Reply with only the word blue.'}]});
  out.checks={arithmetic:arith(text(a.j)),blue:blue(text(b.j)),multiTurnBlue:blue(text(m.j)),replies:[text(a.j),text(b.j),text(m.j)].map(s=>s.slice(0,80))};
  // 3. Tool calls: five tries, count well-formed calls with the right argument.
  const tools=[{type:'function',function:{name:'get_weather',description:'Get the current weather for a city',parameters:{type:'object',properties:{city:{type:'string'}},required:['city']}}}];
  let good=0,ms=0;const bad=[];
  for(let i=0;i<5;i++){const r=await call({...noThink,max_tokens:512,tools,messages:[{role:'user',content:'What is the weather in Toronto right now? Use the tool.'}]});ms+=r.ms;
   const tc=r.j.choices?.[0]?.message?.tool_calls?.[0];let okCall=false;try{okCall=tc?.function?.name==='get_weather'&&/toronto/i.test(JSON.parse(tc.function.arguments).city);}catch{}
   if(okCall)good++;else bad.push(r.status+':'+JSON.stringify(r.j.choices?.[0]?.message||r.j.error||r.j).slice(0,120));}
  out.toolCalls={good,of:5,avgSeconds:+(ms/5000).toFixed(1),bad:bad.slice(0,2)};
  // 4. What thinking costs: same question with medium reasoning.
  const med=await call({reasoning_effort:'medium',chat_template_kwargs:{reasoning_effort:'medium'},max_tokens:8192,messages:[{role:'user',content:'This is an installation test. What is 7 plus 5? Answer in one short sentence.'}]},600000);
  out.withThinking={seconds:+(med.ms/1000).toFixed(1),completionTokens:med.j.usage?.completion_tokens??null,answered:arith(text(med.j))};
 }catch(e){out.error=e.message;}
 finally{srv.kill();await sleep(1500);}
 fs.appendFileSync(path.join(LAB,'results.jsonl'),JSON.stringify(out)+'\n');console.log(JSON.stringify(out,null,1));
})();
