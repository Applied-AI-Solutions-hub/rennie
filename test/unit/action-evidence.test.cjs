const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {requestedFiles,capture}=require('../../src/action-evidence.cjs');
test('explicit outputs are distinguished from input files and ordinary conversation',()=>{
 assert.deepEqual(requestedFiles('Read notes.txt. Create summary.txt with the facts.'),[{file:'summary.txt'}]);
 assert.deepEqual(requestedFiles('Use notes.txt to save a short internal brief as launch-brief.md.'),[{file:'launch-brief.md'}]);
 assert.deepEqual(requestedFiles('Summarize notes.txt. What did you save yesterday?'),[]);
 assert.deepEqual(requestedFiles('Do not create summary.txt.'),[]);
 assert.deepEqual(requestedFiles('If needed, create summary.txt.'),[]);
 assert.deepEqual(requestedFiles('Why did you create summary.txt?'),[]);
 assert.deepEqual(requestedFiles('In launch-brief.md, change the heading to Internal launch review.'),[{file:'launch-brief.md'}]);
 assert.deepEqual(requestedFiles('Create summary.txt. Do not invent facts.'),[{file:'summary.txt'}]);
 for(const quote of ['\u201C','\u201D','\u2018','\u2019'])assert.deepEqual(requestedFiles('Create summary.txt '+quote+'as an example'),[]);
});
test('a missing, stale, empty or wrong-content file cannot satisfy an exact output contract',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rennie-evidence-'));
 fs.writeFileSync(path.join(root,'existing.txt'),'old');
 const verify=capture(root,[{file:'new.txt',exactText:'Blue'},{file:'existing.txt',includes:['new']}]);
 assert.ok(verify().every(x=>!x.ok));fs.writeFileSync(path.join(root,'new.txt'),'');assert.equal(verify()[0].ok,false);fs.writeFileSync(path.join(root,'new.txt'),'Exactly Blue');assert.equal(verify()[0].ok,false);
 fs.writeFileSync(path.join(root,'new.txt'),'Blue');fs.writeFileSync(path.join(root,'existing.txt'),'new');assert.ok(verify().every(x=>x.ok));
});
test('file evidence refuses traversal and junctions outside the workspace',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rennie-evidence-')),other=fs.mkdtempSync(path.join(os.tmpdir(),'rennie-outside-'));
 assert.throws(()=>capture(root,[{file:'../outside.txt'}]),/relative/);
 fs.symlinkSync(other,path.join(root,'link'),'junction');assert.throws(()=>capture(root,[{file:'link/result.txt'}]),/leaves/);
});
