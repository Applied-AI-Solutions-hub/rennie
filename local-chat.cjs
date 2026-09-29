'use strict';
// Local chat deliberately does not inject starter identities or model-authored
// graph memories. Existing files stay on disk; they are not trusted user facts.
const SYSTEM = 'You are a helpful assistant in Foxsocket. Answer the user\'s latest request directly and accurately. Follow their requested format. Do not invent personal details, device information, memories, or actions you have taken.';
function messages(history) {
  return [{role:'system',content:SYSTEM}, ...history.filter(m=>m.role==='user'||m.role==='assistant').slice(-24).map(m=>({role:m.role,content:String(m.content??m.text??'')}))];
}
const CHECKS = [
  {id:'arithmetic',prompt:'This is an installation test. What is 7 plus 5? Answer in one short sentence.',accept:reply=>/^(?:(?:7\s*(?:\+|plus)\s*5)\s*(?:=|is|equals)\s*|(?:the answer is|it is|it's)\s*)?(?:12|twelve)[.!]?$/i.test(reply.trim())},
  {id:'instruction',prompt:'Reply with only the word blue.',accept:reply=>/^blue[.!]?$/i.test(reply.trim())},
];
module.exports={SYSTEM,messages,CHECKS};
