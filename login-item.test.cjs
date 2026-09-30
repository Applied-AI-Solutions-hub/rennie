const {test}=require('node:test'),assert=require('node:assert/strict');
const {parse,executable,repairs}=require('./login-item.cjs');
const folder='C:\\Users\\Tester\\AppData\\Local\\Programs\\foxsocket';
const output=['','HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  `    solutions.appliedai.commandcenter    REG_SZ    "${folder}\\Foxsocket.exe"`,
  '    OneDrive    REG_SZ    "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background',
  '    Other Foxsocket    REG_SZ    "C:\\Elsewhere\\Foxsocket.exe"',''].join('\r\n');
test('reads the Run entries from reg query output',()=>{
  assert.deepEqual(parse(output).map(e=>e.name),['solutions.appliedai.commandcenter','OneDrive','Other Foxsocket']);
  assert.equal(executable('"C:\\A B\\x.exe" --flag'),'C:\\A B\\x.exe');assert.equal(executable('C:\\x.exe --flag'),'C:\\x.exe');
});
test('only the old program in this install folder, now gone, is pointed at Rennie.exe, keeping the entry name',()=>{
  const execPath=folder+'\\Rennie.exe',gone=()=>false;
  assert.deepEqual(repairs(parse(output),execPath,gone),[{name:'solutions.appliedai.commandcenter',value:`"${execPath}"`}]);
  assert.deepEqual(repairs(parse(output),execPath,()=>true),[],'an old program that still exists is left alone');
  assert.deepEqual(repairs(parse(output),'C:\\Other\\Rennie.exe',gone),[],'entries from another install folder are left alone');
  assert.deepEqual(repairs(parse(`    x    REG_SZ    "${folder}\\Foxsocket.exe" --hidden`),execPath,gone),[{name:'x',value:`"${execPath}" --hidden`}],'arguments are kept');
});
