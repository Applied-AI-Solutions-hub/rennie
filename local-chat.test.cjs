const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const chat=require('./local-chat.cjs'),agent=require('./foxsocket-agent.cjs');
test('fresh starter context has no preconfigured person, device, or model',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'foxsocket-context-'));
 agent.ensure(root);const graph=agent.loadGraph(root);
 assert.deepEqual(graph.nodes,[]);assert.deepEqual(graph.facts,[]);
 assert.doesNotMatch(agent.systemPrompt(root),/Applied|HomePC|Bonsai|RTX|iPhone|iPad/);
});
test('local conversation prioritizes current request and excludes graph instructions',()=>{
 const result=chat.messages([{role:'system',content:'Old device notes'},{role:'error',text:'failure'},{role:'user',text:'What is 7 plus 5?'}]);
 assert.equal(result.length,2);assert.equal(result.at(-1).content,'What is 7 plus 5?');
 assert.doesNotMatch(result[0].content,/foxsocket-graph|HomePC|Applied|Bonsai/);
 assert.equal(chat.CHECKS[0].accept('7 plus 5 is 12.'),true);
 assert.equal(chat.CHECKS[0].accept('I can access your device notes.'),false);
 assert.equal(chat.CHECKS[0].accept('It is not 12.'),false);
 assert.equal(chat.CHECKS[1].accept('blue'),true);
 assert.equal(chat.CHECKS[1].accept('The word is blue'),false);
});
