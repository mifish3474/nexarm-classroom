import type {TeacherRobotControl} from '../safety/TeacherRobotControl';
import {NamedPositions} from './NamedPositions';
import {poseIssues} from '../safety/OperatingRanges';

export function createTeachingPanel(getControl:()=>TeacherRobotControl|null){
  const node=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  const support=node<HTMLInputElement>('teach-support'),held=node<HTMLInputElement>('teach-held'),name=node<HTMLInputElement>('pose-name');
  // Access to storage can itself be denied; retain a usable memory-only list.
  const storage={getItem:(key:string)=>localStorage.getItem(key),setItem:(key:string,value:string)=>localStorage.setItem(key,value)};
  const saved=new NamedPositions(storage);
  let error='',live=false,preparing=false,previousConnection='Disconnected';
  const moveButtons:{button:HTMLButtonElement;issue:string}[]=[];
  function drawSaved(){
    const list=node('saved-positions');list.replaceChildren();moveButtons.length=0;
    for(const pose of saved.list()){
      const row=document.createElement('li'),label=document.createElement('strong'),values=document.createElement('p'),remove=document.createElement('button');
      label.textContent=pose.name;values.textContent=pose.positions.map((value,i)=>`S${i+1}: ${value}`).join(' · ');
      const issue=poseIssues(pose.positions).join(' '),warning=document.createElement('p');warning.className='note';warning.textContent=issue?`${issue} Record a replacement within range; this saved position is unchanged.`:'';warning.hidden=!issue;
      remove.textContent='Delete';remove.className='secondary';remove.setAttribute('aria-label',`Delete position ${pose.name}`);
      const move=document.createElement('button');move.textContent='Move to position';move.setAttribute('aria-label',`Move to position ${pose.name}`);
      move.onclick=()=>act(()=>{const control=getControl();if(!control)throw Error('Connect and enable the robot.');control.moveToPosition(pose.positions);});moveButtons.push({button:move,issue});
      remove.onclick=()=>act(()=>{saved.remove(pose.id);drawSaved();});row.append(label,values,warning,move,remove);list.append(row);
    }
    const count=saved.list().length;
    node('pose-storage-status').textContent=`${count}/32 positions. ${count===32?'Export or delete an old position to record another. ':''}${saved.message}`;
    node<HTMLButtonElement>('pose-export').disabled=saved.list().length===0;
    document.dispatchEvent(new Event('named-positions-changed'));
  }
  function act(action:()=>void){error='';try{action();}catch(caught){error=caught instanceof Error?caught.message:'Action could not complete.';}refresh(live,preparing);}
  function refresh(robotMode:boolean,isPreparing:boolean){
    live=robotMode;preparing=isPreparing;node('teach-panel').hidden=!live;
    const state=getControl()?.snapshot();
    moveButtons.forEach(({button,issue})=>{button.disabled=!!issue||isPreparing||!state?.canMove;button.title=issue||state?.reason||'Move all needed joints together at speed 600, acceleration 10.';});
    if(state&&state.manualPhase!=='Normal')node<HTMLDetailsElement>('teach-details').open=true;
    if(previousConnection==='Listening'&&state?.connectionState!=='Listening'){support.checked=false;held.checked=false;}
    previousConnection=state?.connectionState??'Disconnected';
    node<HTMLButtonElement>('teach-release').disabled=!support.checked||isPreparing||!state?.canRelease;
    node<HTMLButtonElement>('teach-restore').disabled=!support.checked||isPreparing||!state?.canRestore;
    node<HTMLButtonElement>('teach-confirm').disabled=!held.checked||isPreparing||!state?.canConfirmHolding;
    node<HTMLButtonElement>('pose-record').disabled=isPreparing||!state?.canCapture||!saved.canAdd||!name.value.trim();
    const text=state?`${state.manualPhase}: ${state.manualMessage}${state.manualReason?` ${state.manualReason}`:''}`:'Connect the robot to release holding or record measured positions.';
    if(node('teach-status').textContent!==text)node('teach-status').textContent=text;
    const readings=state?.positions?`${state.canCapture?'Current readings':'Latest readings'}: ${state.positions.map((value,i)=>`S${i+1} ${value}`).join(' · ')}`:'Waiting for six measured positions.';
    if(node('teach-readings').textContent!==readings)node('teach-readings').textContent=readings;
    node('teach-error').textContent=error;node('teach-error').hidden=!error;
    name.disabled=isPreparing||!!state?.busy;
  }
  node('teach-release').onclick=()=>act(()=>{held.checked=false;getControl()?.setHolding(false,support.checked);});
  node('teach-restore').onclick=()=>act(()=>getControl()?.setHolding(true,support.checked));
  node('teach-confirm').onclick=()=>act(()=>{getControl()?.confirmHolding(held.checked);held.checked=false;support.checked=false;});
  node('pose-record').onclick=()=>act(()=>{
    const control=getControl();if(!control)throw Error('Connect to read the robot positions.');
    saved.add(name.value,control.capturePosition());name.value='';drawSaved();
  });
  node('pose-clear').onclick=()=>act(()=>{saved.clear();drawSaved();});
  node('pose-export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([saved.export()],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='nexarm-named-positions.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  support.onchange=held.onchange=name.oninput=()=>refresh(live,preparing);
  drawSaved();return {refresh,list:()=>saved.list()};
}
