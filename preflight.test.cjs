const {test}=require('node:test'),assert=require('node:assert/strict');
const {assess,plan,recommendModel,GB}=require('./preflight.cjs');
const {MODELS}=require('./local-model.cjs');
test('a fresh PC needs room for Ollama, the model, OpenClaw and a safety margin',()=>{
 const {download,space}=plan({needsOllama:true,needsModel:true,modelBytes:2*GB,needsOpenClaw:true});
 assert.ok(download>3.5*GB&&download<4*GB,'about 3.8 GB is downloaded: Ollama installer, model and OpenClaw');
 assert.ok(space>10*GB&&space<12*GB);
});
test('nothing to download means nothing to check',()=>{
 assert.deepEqual(plan({needsOllama:false,needsModel:false,needsOpenClaw:false}),{download:0,space:0});
});
test('too little space produces a plain-language instruction before any download',()=>{
 const result=assess({freeBytes:3*GB,totalMemory:16*GB,needsOllama:true,needsModel:true,modelBytes:2*GB,needsOpenClaw:true});
 assert.equal(result.enoughSpace,false);assert.match(result.problem,/about 11\.\d GB .* only 3 GB is free.*Recycle Bin.*Nothing has been downloaded/);
 assert.equal(assess({freeBytes:50*GB,needsOllama:true,needsModel:true,modelBytes:2*GB}).enoughSpace,true);
 assert.equal(assess({freeBytes:NaN,needsOllama:true}).enoughSpace,true,'an unreadable disk does not block setup');
});
test('a custom model of unknown size is not passed off as fitting',()=>{
 const result=assess({freeBytes:50*GB,needsOllama:false,needsModel:true,modelBytes:null,needsOpenClaw:false});
 assert.equal(result.modelKnown,false);assert.match(result.caution,/not known until it downloads/);assert.equal(result.download,0,'no 2 GB default is budgeted for it');
 assert.equal(assess({freeBytes:50*GB,needsModel:true,modelBytes:2*GB}).caution,null);
});
test('models on another drive are checked there, and everything else on the system drive',()=>{
 const needs={needsOllama:true,needsModel:true,modelBytes:2*GB,needsOpenClaw:true};
 const systemFull=assess({freeBytes:3*GB,modelFreeBytes:500*GB,...needs});
 assert.equal(systemFull.enoughSpace,false,'a roomy models drive does not hide a full system drive');assert.match(systemFull.problem,/on the system drive, but only 3 GB/);
 const modelsFull=assess({freeBytes:500*GB,modelFreeBytes:3*GB,...needs});
 assert.equal(modelsFull.enoughSpace,false);assert.match(modelsFull.problem,/drive Ollama stores models on, but only 3 GB/);
 assert.equal(assess({freeBytes:20*GB,modelFreeBytes:20*GB,...needs}).enoughSpace,true);
});
test('the recommended model follows this PC’s memory',()=>{
 assert.equal(recommendModel(16*GB,MODELS),'llama3.2:3b');
 assert.equal(recommendModel(7.7*GB,MODELS),'llama3.2:3b','an 8 GB PC reports about 7.7 GB');
 assert.equal(recommendModel(4*GB,MODELS),'llama3.2:1b');
 assert.equal(recommendModel(undefined,MODELS),'llama3.2:3b');
});
test('the llama.cpp engine is sized from its own archive and unpacked build, not Ollama’s',()=>{
 const needs={needsRuntime:true,runtimeDownloadBytes:0.65*GB,runtimeSpaceBytes:1.2*GB,needsModel:true,modelBytes:7.2*GB,needsOpenClaw:true};
 const {download,space}=plan(needs);
 assert.ok(Math.abs(download-(0.65+7.2+0.2)*GB)<1e6,'archive, model and OpenClaw');
 assert.ok(Math.abs(space-((0.65+1.2)+1.5+7.2*1.1+2)*GB)<1e6,'archive and unpacked build together, OpenClaw, model and margin');
 assert.deepEqual(plan({needsRuntime:false,needsModel:false,needsOpenClaw:false}),{download:0,space:0},'nothing to do means nothing to check');
 assert.equal(assess({freeBytes:8*GB,...needs}).enoughSpace,false);
});
