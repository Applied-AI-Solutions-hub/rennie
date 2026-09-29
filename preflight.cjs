'use strict';
// Checks this PC before any download starts, so a beginner learns about a full
// disk in the first second instead of after an hour of downloading.
const GB=1024**3;
// Measured/published sizes, rounded up. The Ollama installer download was
// 1.57 GB on 2026-09-26 (v0.34.4); Ollama documents "at least 4GB of space for
// the binary install". OpenClaw plus Node.js and Git is an estimate.
const SIZES=Object.freeze({ollamaDownload:1.6*GB,ollamaInstalled:4*GB,openclaw:1.5*GB,margin:2*GB});
// 8 GB PCs usually report about 7.7 GB. Below that, the 3B model competes with
// Windows for memory, so the smaller model is recommended instead.
const LARGE_MODEL_MEMORY=7.5*GB;
const gb=bytes=>(Math.round(bytes/GB*10)/10).toFixed(1).replace(/\.0$/,'');
// The model goes where Ollama keeps models; everything else goes to the system drive.
// A custom model's size is unknown before it downloads, so it is left out rather than guessed.
// Ollama is sized here; the llama.cpp engine reports its own sizes (needsRuntime, runtimeDownloadBytes,
// runtimeSpaceBytes), and while unpacking, the archive and the unpacked build are on disk together.
function parts({needsOllama,needsRuntime,runtimeDownloadBytes=0,runtimeSpaceBytes=0,needsModel,modelBytes,needsOpenClaw}){
  const modelKnown=!needsModel||Number.isFinite(modelBytes),model=needsModel&&modelKnown?modelBytes:0;
  const runtime=needsRuntime?{download:runtimeDownloadBytes,space:runtimeDownloadBytes+runtimeSpaceBytes}:needsOllama?{download:SIZES.ollamaDownload,space:SIZES.ollamaDownload+SIZES.ollamaInstalled}:{download:0,space:0};
  const download=runtime.download+model+(needsOpenClaw?0.2*GB:0);
  return {download,modelKnown,system:runtime.space+(needsOpenClaw?SIZES.openclaw:0),model:model*1.1,margin:download||!modelKnown?SIZES.margin:0};
}
function plan(needs){const p=parts(needs);return {download:p.download,space:p.system+p.model+p.margin};}
// modelFreeBytes is given only when models live on a different drive from the system drive.
function assess({freeBytes,modelFreeBytes,totalMemory,...needs}){
  const p=parts(needs),space=p.system+p.model+p.margin,separate=modelFreeBytes!==undefined,known=Number.isFinite;
  const checks=separate?[[freeBytes,p.system&&p.system+SIZES.margin,'the system drive'],[modelFreeBytes,p.model&&p.model+SIZES.margin,'the drive Ollama stores models on']]:[[freeBytes,space,'this PC']];
  const short=checks.find(([free,need])=>known(free)&&free<need),enoughSpace=!short;
  return {download:p.download,space,freeBytes:known(freeBytes)?freeBytes:null,modelFreeBytes:separate&&known(modelFreeBytes)?modelFreeBytes:null,totalMemory:known(totalMemory)?totalMemory:null,enoughSpace,modelKnown:p.modelKnown,
    problem:enoughSpace?null:`Setup needs about ${gb(short[1])} GB of free space on ${short[2]}, but only ${gb(short[0])} GB is free. Free up space (for example, empty the Recycle Bin or uninstall apps you no longer use), then choose Resume setup. Nothing has been downloaded.`,
    caution:p.modelKnown?null:'The size of this model is not known until it downloads, so it is not part of this space check. Large models can need tens of gigabytes.'};
}
function recommendModel(totalMemory,models){
  if(!Number.isFinite(totalMemory)||totalMemory>=LARGE_MODEL_MEMORY)return models[0].id;
  return (models.find(m=>m.small)||models[0]).id;
}
module.exports={assess,plan,recommendModel,GB};
