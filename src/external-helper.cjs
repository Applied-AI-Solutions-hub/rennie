'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function materialize(directory,name){
 if(name!=='openclaw-cancel.mjs')throw Error('Unknown external helper.');
 const bytes=fs.readFileSync(path.join(__dirname,name));
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const dir=path.join(directory,'helpers',hash),file=path.join(dir,name);
 fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(file)||!fs.readFileSync(file).equals(bytes)){
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,bytes,{flag:'wx',mode:0o600});fs.renameSync(tmp,file);
 }
 return file;
}
module.exports={materialize};
