'use strict';
// "Start when I sign in" is a value under HKCU\...\Run that holds the program's path. The rename changed
// the program from Foxsocket.exe to Rennie.exe in the same install folder, so a value still pointing at
// the old, now missing file is pointed at this program. The value keeps its name, so Windows' own on/off
// switch for it (StartupApproved) is unchanged. Nothing else is touched: other programs' entries, entries
// outside this install folder, and an old file that still exists are all left alone.
const path=require('node:path');
const RUN='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
// `reg query` output: four spaces, name, four spaces, type, four spaces, data.
const parse=output=>String(output).split(/\r?\n/).map(line=>/^ {4}(.+?) {4}REG_(?:EXPAND_)?SZ {4}(.*)$/.exec(line)).filter(Boolean).map(([,name,value])=>({name,value}));
const executable=value=>{const match=/^\s*"([^"]+)"|^\s*(\S+)/.exec(value);return match?match[1]||match[2]:'';};
function repairs(entries,execPath,exists){
  const folder=path.dirname(execPath).toLowerCase();
  return entries.filter(({value})=>{const exe=executable(value);return /^foxsocket\.exe$/i.test(path.basename(exe))&&path.dirname(exe).toLowerCase()===folder&&!exists(exe);})
    .map(({name,value})=>({name,value:value.replace(executable(value),execPath)}));
}
module.exports={RUN,parse,executable,repairs};
