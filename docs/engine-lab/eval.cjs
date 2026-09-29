// Auto-graded quality probe for everyday assistant tasks. Same prompts, same
// server settings, temperature 0, thinking off. Usage: node eval.cjs <name> <model.gguf> [gpu|cpu]
const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const LAB=__dirname,PORT=18080,BASE=`http://127.0.0.1:${PORT}`,KEY='eval-'+Date.now();
const [name,modelFile,mode='gpu']=process.argv.slice(2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const noThink={reasoning_effort:'none',chat_template_kwargs:{enable_thinking:false,reasoning_effort:'none'}};
const words=s=>s.trim().split(/\s+/).filter(Boolean).length;
const T=[
 ['change','A shop sells pens at $3 each. Sam buys 4 pens and pays with a $20 bill. How much change does he get? Reply with just the number.',s=>/^\$?8(\.00)?\.?$/.test(s.trim())],
 ['multiply','What is 17 times 23? Reply with just the number.',s=>/^391\.?$/.test(s.trim())],
 ['minutes','How many minutes are in 3.5 hours? Reply with just the number.',s=>/^210\.?$/.test(s.trim())],
 ['weekday','If today is Wednesday, what day of the week will it be in 10 days? Reply with one word.',s=>/^saturday\.?$/i.test(s.trim())],
 ['shortest','Tom is taller than Jim. Jim is taller than Sue. Who is the shortest? Reply with one word.',s=>/^sue\.?$/i.test(s.trim())],
 ['capital','What is the capital of Australia? Reply with one word.',s=>/^canberra\.?$/i.test(s.trim())],
 ['colors','List three colors, comma-separated, all lowercase, nothing else.',s=>/^[a-z]+, ?[a-z]+, ?[a-z]+$/.test(s.trim())],
 ['json','Return a JSON object with keys "name" and "age" for a person named Ana who is 31. Output only the JSON, no code fences.',s=>{try{const j=JSON.parse(s.trim());return j.name==='Ana'&&j.age===31;}catch{return false;}}],
 ['email','Give only the email address from this text: "Contact Maria at maria.lopez@example.org before Friday."',s=>s.trim().replace(/\.$/,'')==='maria.lopez@example.org'],
 ['fivewords','Describe the ocean in exactly five words.',s=>words(s.replace(/[.!]/g,''))===5],
 ['summary','Summarize in fewer than 12 words: "Regular backups protect small businesses from losing important data after hardware failure, theft, or ransomware attacks."',s=>words(s)<12&&/backup/i.test(s)],
 ['reverse','Spell the word "necessary" backwards. Reply with only the result.',s=>/^yrassecen\.?$/i.test(s.trim())],
];
const tools=[
 {type:'function',function:{name:'get_weather',description:'Get the current weather for a city',parameters:{type:'object',properties:{city:{type:'string'}},required:['city']}}},
 {type:'function',function:{name:'add_calendar_event',description:'Add an event to the user calendar',parameters:{type:'object',properties:{title:{type:'string'},day:{type:'string'},time:{type:'string'}},required:['title','day']}}},
];
const TOOLS=[
 ['tool:calendar','Add a dentist appointment on Friday at 3pm to my calendar.',c=>c?.function?.name==='add_calendar_event'&&/dentist/i.test(JSON.parse(c.function.arguments).title||'')&&/fri/i.test(JSON.parse(c.function.arguments).day||'')],
 ['tool:weather','Is it raining in Chicago right now?',c=>c?.function?.name==='get_weather'&&/chicago/i.test(JSON.parse(c.function.arguments).city)],
 ['tool:none','What is 2 plus 2? Answer directly.',(c,msg)=>!c&&/\b4\b|four/i.test(msg?.content||'')],
];
async function ask(body){const r=await fetch(BASE+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+KEY},body:JSON.stringify({temperature:0,seed:42,max_tokens:256,...noThink,...body}),signal:AbortSignal.timeout(300000)});return r.json();}
(async()=>{
 const exe=path.join(LAB,'bin',mode==='gpu'?'cuda':'cpu','llama-server.exe');
 const srv=spawn(exe,['-m',modelFile,'--host','127.0.0.1','--port',String(PORT),'-c','16384','--jinja','-fa','on','-np','1','-ngl',mode==='gpu'?'99':'0','--api-key',KEY,'--reasoning-format','deepseek'],{windowsHide:true});
 let exited=null;srv.on('exit',c=>exited=c);const out={name,mode,results:{}};
 try{
  for(const t0=Date.now();;){if(exited!==null)throw Error('server exited');try{if((await fetch(BASE+'/health')).ok)break;}catch{}if(Date.now()-t0>600000)throw Error('load timeout');await sleep(500);}
  const t=Date.now();
  for(const [id,prompt,ok] of T){const j=await ask({messages:[{role:'user',content:prompt}]});const s=String(j.choices?.[0]?.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim();out.results[id]={pass:!!(()=>{try{return ok(s);}catch{return false;}})(),reply:s.slice(0,60)};}
  for(const [id,prompt,ok] of TOOLS){const j=await ask({tools,messages:[{role:'user',content:prompt}]});const msg=j.choices?.[0]?.message;const c=msg?.tool_calls?.[0];let pass=false;try{pass=!!ok(c,msg);}catch{}out.results[id]={pass,reply:(c?c.function.name+JSON.stringify(c.function.arguments):String(msg?.content||'')).slice(0,60)};}
  out.seconds=+((Date.now()-t)/1000).toFixed(1);
  out.score=Object.values(out.results).filter(r=>r.pass).length+'/'+Object.keys(out.results).length;
 }catch(e){out.error=e.message;}finally{srv.kill();await sleep(1500);}
 fs.appendFileSync(path.join(LAB,'eval.jsonl'),JSON.stringify(out)+'\n');
 console.log(out.name,out.mode,'score',out.score,'in',out.seconds,'s',out.error||'');
 for(const [id,r] of Object.entries(out.results))if(!r.pass)console.log('   miss',id,'->',JSON.stringify(r.reply));
})();
