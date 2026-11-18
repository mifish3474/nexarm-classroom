import type {TeacherRobotControl} from '../safety/TeacherRobotControl';
import {NamedPositions} from './NamedPositions';
import {poseIssues,OPERATING_RANGES,targetIssue} from '../safety/OperatingRanges';

export function createTeachingPanel(getControl:()=>TeacherRobotControl|null){
  const node=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  const name=node<HTMLInputElement>('pose-name');
  // Access to storage can itself be denied; retain a usable memory-only list.
  const storage={getItem:(key:string)=>localStorage.getItem(key),setItem:(key:string,value:string)=>localStorage.setItem(key,value)};
  const saved=new NamedPositions(storage);
  const readings=OPERATING_RANGES.map((range,i)=>{
    const box=document.createElement('div');box.className='teach-reading';box.dataset.joint=String(i+1);
    const label=document.createElement('label');label.textContent=`J${i+1}`;
    const input=document.createElement('input');input.type='text';input.readOnly=true;input.value='—';input.setAttribute('aria-label',`J${i+1} reported position`);
    const reference=document.createElement('small');reference.id=`teach-reading-range-${i+1}`;reference.textContent=`${range.min}–${range.max}`;reference.title=`Valid range${i===5?'; 1024 = gripper open':''}`;
    const status=document.createElement('span');status.className='teach-reading-status';status.id=`teach-reading-status-${i+1}`;
    input.setAttribute('aria-describedby',`${reference.id} ${status.id}`);label.append(input);box.append(label,reference,status);node('teach-readings').append(box);return {box,input,status};
  });
  let error='',live=false,preparing=false;
  const moveButtons:{button:HTMLButtonElement;issue:string}[]=[];
  const addButtons:HTMLButtonElement[]=[];
  function drawSaved(){
    const list=node('saved-positions');list.replaceChildren();moveButtons.length=0;addButtons.length=0;
    for(const pose of saved.list()){
      const row=document.createElement('li'),label=document.createElement('strong'),values=document.createElement('p'),remove=document.createElement('button');
      label.textContent=pose.name;values.textContent=pose.positions.map((value,i)=>`S${i+1}: ${value}`).join(' · ');
      const issue=poseIssues(pose.positions).join(' '),warning=document.createElement('p');warning.className='note';warning.textContent=issue?`${issue} Record a replacement within range; this saved position is unchanged.`:'';warning.hidden=!issue;
      remove.textContent='Delete';remove.className='secondary';remove.setAttribute('aria-label',`Delete position ${pose.name}`);
      const move=document.createElement('button');move.textContent='Move to position';move.setAttribute('aria-label',`Move to position ${pose.name}`);
      move.onclick=()=>act(()=>{const control=getControl();if(!control)throw Error('Connect the robot.');control.moveToPosition(pose.positions);});moveButtons.push({button:move,issue});
      const heading=document.createElement('div');heading.className='saved-position-heading';
      const add=document.createElement('button');add.className='secondary';add.textContent='+ Add to code';add.setAttribute('aria-label',`Add position ${pose.name} to code`);
      add.onclick=()=>document.dispatchEvent(new CustomEvent('add-position-to-code',{detail:pose.id}));addButtons.push(add);heading.append(label,add);
      const details=document.createElement('details');details.className='saved-position-details';
      const summary=document.createElement('summary');summary.textContent='Joint values & movement';
      details.append(summary,values,move,remove);
      remove.onclick=()=>act(()=>{saved.remove(pose.id);drawSaved();});row.append(heading,warning,details);list.append(row);
    }
    const count=saved.list().length;
    node('pose-storage-status').textContent=`${count}/32 positions. ${count===32?'Export or delete an old position to record another. ':''}${saved.message}`;
    node<HTMLButtonElement>('pose-export').disabled=saved.list().length===0;
    document.dispatchEvent(new Event('named-positions-changed'));
  }
  function act(action:()=>void){error='';try{action();}catch(caught){error=caught instanceof Error?caught.message:'Action could not complete.';}refresh(live,preparing);}
  function refresh(robotMode:boolean,isPreparing:boolean){
    live=robotMode;preparing=isPreparing;
    const state=getControl()?.snapshot();
    moveButtons.forEach(({button,issue})=>{button.disabled=!!issue||isPreparing||!state?.canMove;button.title=issue||state?.reason||'Send all six targets at speeds up to 600, acceleration 10. Completes on frame time; inspect live readings.';});
    addButtons.forEach(button=>button.disabled=isPreparing||!!state?.busy);
    node<HTMLButtonElement>('teach-release').disabled=isPreparing||!state?.canRelease;
    node('teach-release').title=state?.manualPhase==='Manual setup'?'Release was requested but physical holding is not measured. Support the arm and click to send Release again.':'Support the arm before releasing holding.';
    node<HTMLButtonElement>('teach-restore').disabled=isPreparing||!state?.canRestore;
    node<HTMLButtonElement>('teach-home').disabled=isPreparing||!state?.canRestoreAndHome;
    node<HTMLButtonElement>('pose-record').disabled=isPreparing||!state?.canCapture||!saved.canAdd||!name.value.trim();
    const text=state?.recovery?.active?state.recovery.message:state?.manualPhase==='Normal'?(state.feedbackFresh?'Record a stationary pose, or Release to position by hand.':'Waiting for fresh joint readings.'):state?`${state.manualPhase}: ${state.manualMessage}${state.manualReason?` ${state.manualReason}`:''}`:'Connect for joint readings and position teaching.';
    if(node('teach-status').textContent!==text)node('teach-status').textContent=text;
    const issues=state?.positions?poseIssues(state.positions):[];
    node('pose-recording').classList.toggle('out-of-range',issues.length>0);
    readings.forEach(({box,input,status},i)=>{
      const value=state?.positions?.[i],issue=value===undefined?null:targetIssue(i+1,value);
      input.value=value===undefined?'—':String(value);input.setAttribute('aria-invalid',String(!!issue));box.classList.toggle('out-of-range',!!issue);
      const text=value===undefined?'Waiting':issue?'Out of range':state?.feedbackFresh?'In range · live':'In range · last reading';
      if(status.textContent!==text)status.textContent=text;
    });
    const captureStatus=issues.length?`Cannot record: ${issues.join(' ')}`:isPreparing?'Wait for program preparation.':!state?.feedbackFresh?'Waiting for fresh live readings. Recording is disabled.':!state.canCapture?state.captureReason:!saved.canAdd?'Export or delete an old position before recording another.':!name.value.trim()?'All joints are in range. Enter a position name to record.':'All joints are in range. Ready to record.';
    if(node('pose-capture-status').textContent!==captureStatus)node('pose-capture-status').textContent=captureStatus;
    node('teach-error').textContent=error;node('teach-error').hidden=!error;
    name.disabled=isPreparing||!!state?.busy;
  }
  node('teach-release').onclick=()=>act(()=>getControl()?.setHolding(false,true));
  node('teach-restore').onclick=()=>act(()=>getControl()?.setHolding(true,true));
  node('pose-record').onclick=()=>act(()=>{
    const control=getControl();if(!control)throw Error('Connect to read the robot positions.');
    saved.add(name.value,control.capturePosition());name.value='';drawSaved();
  });
  node('pose-clear').onclick=()=>act(()=>{saved.clear();drawSaved();});
  node('pose-export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([saved.export()],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='nexarm-named-positions.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  name.oninput=()=>refresh(live,preparing);
  drawSaved();return {refresh,list:()=>saved.list(),replacePositions:(positions:unknown)=>{saved.replace(positions);error='';name.value='';drawSaved();refresh(live,preparing);}};
}
