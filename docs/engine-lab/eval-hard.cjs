// Auto-graded quality probe for everyday assistant tasks. Same prompts, same
// server settings, temperature 0, thinking off. Usage: node eval.cjs <name> <model.gguf> [gpu|cpu]
const {spawn}=require('child_process');const fs=require('fs'),path=require('path');
const LAB=__dirname,PORT=18080,BASE=`http://127.0.0.1:${PORT}`,KEY='eval-'+Date.now();
const [name,modelFile,mode='gpu']=process.argv.slice(2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const noThink=process.env.THINK?{reasoning_effort:process.env.THINK,chat_template_kwargs:{enable_thinking:true,reasoning_effort:process.env.THINK}}:{reasoning_effort:'none',chat_template_kwargs:{enable_thinking:false,reasoning_effort:'none'}};
const words=s=>s.trim().split(/\s+/).filter(Boolean).length;
const T=[
 ['train','A train leaves at 2:45 PM and the trip takes 3 hours 50 minutes. What time does it arrive? Reply only as H:MM PM.',s=>/^6:35 ?pm.?$/i.test(s.trim())],
 ['apples','I have 3 boxes with 12 apples each. I give away 7 apples and eat 2. How many apples are left? Reply with just the number.',s=>/^27.?$/.test(s.trim())],
 ['percent','What is 15% of 240? Reply with just the number.',s=>/^36(.0+)?.?$/.test(s.trim())],
 ['sort','Sort these numbers ascending, comma-separated, nothing else: 42, 7, 19, 3, 88',s=>s.replace(/[^0-9,]/g,'')==='3,7,19,42,88'],
 ['letters','How many times does the letter r appear in the word strawberry? Reply with just the number.',s=>/^3.?$/.test(s.trim())],
 ['timezone','A meeting is at 10:00 in New York (UTC-4). What time is it in London (UTC+1)? Reply only as HH:MM.',s=>/^15:00.?$/.test(s.trim())],
 ['order','Anna is older than Ben. Carl is younger than Ben. Dana is older than Anna. Who is the second oldest? Reply with one word.',s=>/^anna.?$/i.test(s.trim())],
 ['sequence','What is the next number: 2, 6, 12, 20, 30, ? Reply with just the number.',s=>/^42.?$/.test(s.trim())],
 ['recipe','A recipe for 4 people needs 300 g of flour. How many grams for 10 people? Reply with just the number.',s=>/^750( ?g)?.?$/i.test(s.trim())],
 ['decimals','Which is larger, 9.11 or 9.9? Reply with just the number.',s=>/^9.9.?$/.test(s.trim())],
 ['orderjson','Extract the order as JSON with keys item, quantity, price_each from: "I would like three large coffees at $4.50 each." Output only JSON, no code fences.',s=>{try{const j=JSON.parse(s.trim());return /coffee/i.test(j.item)&&Number(j.quantity)===3&&Number(j.price_each)===4.5;}catch{return false;}}],
];
const tools=['get_weather:Get the current weather for a city:city','add_calendar_event:Add an event to the user calendar:title,day,time','send_email:Send an email to a contact:to,subject,body','set_timer:Start a countdown timer that reminds the user:minutes,label'].map(x=>{const [name,description,props]=x.split(':');return {type:'function',function:{name,description,parameters:{type:'object',properties:Object.fromEntries(props.split(',').map(p=>[p,{type:p==='minutes'?'number':'string'}])),required:[props.split(',')[0]]}}};});
const A=c=>JSON.parse(c.function.arguments);
const TOOLS=[
 ['tool:timer','Remind me in 25 minutes to take the bread out of the oven.',c=>c?.function?.name==='set_timer'&&Number(A(c).minutes)===25],
 ['tool:email','Email Priya to tell her the quarterly report is ready.',c=>c?.function?.name==='send_email'&&/priya/i.test(A(c).to)],
 ['tool:calendar','Put lunch with Marco on my calendar for Thursday at noon.',c=>c?.function?.name==='add_calendar_event'&&/marco|lunch/i.test(A(c).title)&&/thu/i.test(A(c).day)],
];
async function ask(body){const r=await fetch(BASE+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+KEY},body:JSON.stringify({temperature:0,seed:42,max_tokens:process.env.THINK?8192:256,...noThink,...body}),signal:AbortSignal.timeout(300000)});return r.json();}
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
 fs.appendFileSync(path.join(LAB,'eval-hard.jsonl'),JSON.stringify(out)+'\n');
 console.log(out.name,out.mode,'score',out.score,'in',out.seconds,'s',out.error||'');
 for(const [id,r] of Object.entries(out.results))if(!r.pass)console.log('   miss',id,'->',JSON.stringify(r.reply));
})();
