'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// A deliberately narrow contract: explicit, named text outputs in the user's
// request. This is not a semantic judge of arbitrary assistant claims.
function requestedFiles(message){
 // Negated, conditional and quoted instructions are not action contracts.
 if(/\b(?:if|unless|hypothetical|example|quote)\b/i.test(message)||/[\u201C\u201D\u2018\u2019]|```/.test(message))return [];
 const names=[];
 // Match the output immediately after the verb, or after "as" / "to".
 const output=/\b(?:save|create|write|export|edit|update)\s+(?:(?:a|the)\s+)?["`']?([\w.-]+(?:\/[\w.-]+)*\.(?:txt|md|csv|json))\b|\b(?:save|create|write|export)\b[^\n!?]*?\b(?:as|to)\s+["`']?([\w.-]+(?:\/[\w.-]+)*\.(?:txt|md|csv|json))\b/gi;
 for(const match of message.matchAll(output)){const prefix=message.slice(0,match.index);if(!/(?:^|[.!?;]\s*|\bthen\s+|\bto\s+|\bplease\s+|\bcan you\s+|\bcould you\s+)$/i.test(prefix))continue;const name=match[1]||match[2];if(!name.split('/').includes('..')&&!names.includes(name))names.push(name);}
 const edit=/^(?:please\s+)?in\s+["`']?([\w.-]+(?:\/[\w.-]+)*\.(?:txt|md|csv|json))["`']?,?\s+(?:change|replace|update)\b/i.exec(message);
 if(edit&&!edit[1].split('/').includes('..')&&!names.includes(edit[1]))names.push(edit[1]);
 return names.slice(0,16).map(file=>({file}));
}
function capture(root,expected){
 const canonical=fs.realpathSync(root);
 function inspect(file){
  if(typeof file!=='string'||path.isAbsolute(file)||file.split(/[\\/]/).some(p=>p==='..'||!p)||file.includes(':'))throw Error('File verification requires a relative workspace path.');
  const full=path.resolve(canonical,file);
  if(!full.startsWith(canonical+path.sep))throw Error('File verification path is outside the workspace.');
  // Check every existing component, including Windows junctions, before reading.
  let cursor=canonical;
  for(const part of path.relative(canonical,full).split(path.sep)){cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&!fs.realpathSync(cursor).startsWith(canonical+path.sep))throw Error('File verification path leaves the workspace.');}
  try{const stat=fs.statSync(full);if(!stat.isFile()||stat.size>8*1024*1024)return null;const bytes=fs.readFileSync(full);return {hash:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,text:bytes.toString('utf8'),mtimeMs:stat.mtimeMs};}catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
 const items=expected.map(item=>({...item,before:inspect(item.file)}));
 return ()=>items.map(item=>{
  const after=inspect(item.file),changed=!!after&&(!item.before||after.hash!==item.before.hash||after.mtimeMs!==item.before.mtimeMs);
  const contentMatches=!!after&&(after.bytes>0||item.exactText==='')&&(!Object.hasOwn(item,'exactText')||after.text===item.exactText)&&(item.includes||[]).every(text=>after.text.includes(text));
  return {file:item.file,ok:changed&&contentMatches,exists:!!after,changed,contentMatches,bytes:after?.bytes||0,sha256:after?.hash||null};
 });
}
module.exports={requestedFiles,capture};
