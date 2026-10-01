'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {download}=require('./download.cjs');
const execute=promisify(execFile);
const INSTALLER='https://ollama.com/download/OllamaSetup.exe';
// Ollama's publisher, as signed on its Windows binaries (DigiCert-issued).
// Both the common name and the organization must match exactly: a valid
// certificate that merely mentions "Ollama" somewhere is not enough.
const PUBLISHER='Ollama Inc.';
const DOWNLOAD_REASONS={
 stalled:'The Ollama download stopped receiving data and did not recover after several automatic retries. Check the internet connection, then choose Resume setup; the download continues where it stopped.',
 network:'The connection dropped during the Ollama download and did not recover after several automatic retries. Choose Resume setup when you are back online; the download continues where it stopped.',
 server:'The Ollama download server is busy or unavailable. Wait a few minutes, then choose Resume setup.',
 http:'The Ollama download link was refused by the server. Update Rennie or try again later.',
 size:'The Ollama download was larger than expected, so it was not used. Try again later.',
 incomplete:'The Ollama download ended early. Choose Resume setup; the download continues where it stopped.',
 restart:'The saved Ollama download no longer matched the server and was discarded. Choose Resume setup to download it again.',
};
function createWindowsRuntime({directory,api,fetchImpl=fetch,env=process.env,executeImpl=execute,spawnImpl=spawn,platformName=process.platform,stallMs=60000,wait}) {
  const find=async()=>{
    const candidates=[path.join(env.LOCALAPPDATA||'','Programs','Ollama','ollama.exe'),path.join(env.ProgramFiles||'','Ollama','ollama.exe')];
    try{const {stdout}=await executeImpl('where.exe',['ollama.exe'],{windowsHide:true,timeout:5000});candidates.push(...stdout.trim().split(/\r?\n/));}catch{}
    return candidates.find(file=>path.isAbsolute(file)&&fs.existsSync(file))||null;
  };
  async function install(progress) {
    if(platformName!=='win32')throw Error('Automatic Ollama installation is available on Windows.');
    fs.mkdirSync(directory,{recursive:true});
    const target=path.join(directory,'OllamaSetup.exe');
    progress({phase:'downloading-runtime',message:'Downloading Ollama from its official website.',total:null,completed:0});
    try{
      await download({url:INSTALLER,target,fetchImpl,stallMs,wait,maxBytes:4*1024**3,onProgress:p=>progress({phase:'downloading-runtime',message:p.retrying?'The connection paused. Retrying and continuing where the download stopped.':'Downloading Ollama.',total:p.total,completed:p.completed})});
    }catch(error){throw Error(DOWNLOAD_REASONS[error.reason]||'Ollama could not download. Check the connection and retry.');}
    progress({phase:'checking-installer',message:'Checking the Ollama installer signature.',total:null,completed:0});
    // Filename and expected publisher are passed through environment values, never interpreted as code.
    const script="$s=Get-AuthenticodeSignature -LiteralPath $env:RENNIE_INSTALLER; $c=$s.SignerCertificate; if($s.Status -ne 'Valid' -or !$c -or $c.GetNameInfo('SimpleName',$false) -ne $env:RENNIE_PUBLISHER -or $c.Subject -notmatch ('(^|, )O='+[regex]::Escape($env:RENNIE_PUBLISHER)+'(,|$)')){exit 1}";
    try{await executeImpl(path.join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:60000,env:{...env,RENNIE_INSTALLER:target,RENNIE_PUBLISHER:PUBLISHER}});}catch{
      fs.rmSync(target,{force:true});
      throw Error('The Ollama installer signature could not be verified, so it was deleted without running. Check that the Windows date and time are correct, then retry.');
    }
    progress({phase:'installing-runtime',message:'Installing Ollama for your Windows account. If its welcome window opens, return to Rennie; no action there is required.',total:null,completed:0});
    try{await executeImpl(target,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-'],{windowsHide:true,timeout:1800000});}catch{throw Error('Ollama installation did not finish. Check any Windows prompt, then retry.');}
    if(!await find())throw Error('Ollama was not found after installation. Retry setup.');
    // The installer is about 1.5 GB and is not needed once Ollama is installed.
    fs.rmSync(target,{force:true});
  }
  async function start() {
    if(await api.reachable())return;
    const exe=await find();if(!exe)throw Error('Ollama is not installed. Choose Set up local model.');
    const child=spawnImpl(exe,['serve'],{detached:true,windowsHide:true,stdio:'ignore',env:{...env,OLLAMA_HOST:'127.0.0.1:11434'}});
    let spawnError=null;child.on('error',error=>spawnError=error);child.unref();
    for(let attempt=0;attempt<60;attempt++){if(spawnError)throw Error('Ollama could not start. Retry local setup.');if(await api.reachable())return;await new Promise(resolve=>setTimeout(resolve,1000));}
    throw Error('Ollama did not become available. Retry setup or restart Windows.');
  }
  return {find,install,start};
}
module.exports={createWindowsRuntime,INSTALLER,PUBLISHER};
