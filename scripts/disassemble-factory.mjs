// Static Python 3.8 wordcode inspection only. Never imports or executes factory code.
// First run the existing factory extraction helpers; inputs stay in ignored .analysis.
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('.analysis/nexarm-factory');
const [module='nexarm_qt.ui.servo_tab',pattern='.*']=process.argv.slice(2);
if(!/^[a-zA-Z0-9_.]+$/.test(module))throw Error('Invalid module name');
const code=JSON.parse(fs.readFileSync(path.join(dir,`${module}.json`),'utf8'));
const opcodes=JSON.parse(fs.readFileSync(path.join(dir,'opcodes.json'),'utf8'));
const filter=new RegExp(pattern);
function show(value){return value?.kind==='code'?`<code ${value.name}>`:JSON.stringify(value);}
function walk(c){
  if(!c||c.kind!=='code')return;
  if(pattern==='--list')console.log(`${c.name}(${c.varnames.slice(0,c.argcount).join(', ')}) names=${c.names.join(',')}`);
  if(filter.test(c.name)){
    console.log(`\nFUNCTION ${c.name}(${c.varnames.slice(0,c.argcount).join(', ')}) at ${c.filename}:${c.firstline}`);
    console.log(`CONSTANTS ${c.consts.map((v,i)=>`${i}=${show(v)}`).join('; ')}`);
    const bytes=c.bytecode.data;let extended=0;
    for(let i=0;i<bytes.length;i+=2){
      const op=bytes[i],arg=extended+bytes[i+1];extended=op===144?arg*256:0;
      let detail='';
      if(op===100)detail=show(c.consts[arg]);
      else if([90,91,95,96,97,98,101,106,108,109,116,160].includes(op))detail=c.names[arg];
      else if([124,125,126].includes(op))detail=c.varnames[arg];
      else if([135,136,137,138,148].includes(op))detail=[...c.cellvars,...c.freevars][arg];
      else if(op===107)detail=['<','<=','==','!=','>','>=','in','not in','is','is not','exception match','BAD'][arg];
      else if([93,110,122,143,154,162].includes(op))detail=`to ${i+2+arg}`;
      console.log(`${String(i).padStart(5)} ${String(opcodes[op]??op).padEnd(24)} ${op>=90?arg:''} ${detail??''}`);
    }
  }
  for(const v of c.consts)walk(v);
}
walk(code);
