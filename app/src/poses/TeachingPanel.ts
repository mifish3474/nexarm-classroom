import type {TeacherRobotControl} from '../safety/TeacherRobotControl';
import {NamedPositions} from './NamedPositions';
import {OPERATING_RANGES,poseIssues} from '../safety/OperatingRanges';
import {COORDINATE_FIELDS} from '../protocol/CoordinateTarget';

export function createTeachingPanel(getControl:()=>TeacherRobotControl|null){
  const node=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  const name=node<HTMLInputElement>('pose-name');
  const storage={getItem:(key:string)=>localStorage.getItem(key),setItem:(key:string,value:string)=>localStorage.setItem(key,value)};
  const saved=new NamedPositions(storage);
  const readings=COORDINATE_FIELDS.map(field=>{
    const box=document.createElement('div');box.className='teach-reading';box.dataset.coordinate=field.key;
    const label=document.createElement('label');label.textContent=field.field;
    const input=document.createElement('input');input.type='text';input.readOnly=true;input.value='—';input.setAttribute('aria-label',`${field.label} reported value`);
    const reference=document.createElement('small');reference.textContent=`${field.min}–${field.max}${field.key==='pitch'?'°':'xyz'.includes(field.key)?' mm':'°'}`;reference.title='Development input range; not proof that every point is reachable.';
    const status=document.createElement('span');status.className='teach-reading-status';label.append(input);box.append(label,reference,status);node('teach-readings').append(box);return {field,box,input,status};
  });
  const jointReadings=OPERATING_RANGES.map((range,index)=>{
    const joint=index+1,box=document.createElement('div');box.className='joint-safety-card';box.dataset.joint=String(joint);
    const label=document.createElement('strong');label.textContent=`J${joint}`;
    const value=document.createElement('span');value.className='joint-safety-value';value.textContent='—';
    const accepted=document.createElement('small');accepted.textContent=`Accepted ${range.min}–${range.max}`;
    const status=document.createElement('span');status.className='joint-safety-result';status.textContent='Waiting';
    box.append(label,value,accepted,status);node('teach-joints').append(box);return {joint,range,box,value,status};
  });
  const jogStep=node<HTMLInputElement>('teach-jog-step');
  const jogButtons=[...document.querySelectorAll<HTMLButtonElement>('[data-xyz-jog]')];
  let error='',live=false,preparing=false;
  const moveButtons:{button:HTMLButtonElement;issue:string}[]=[];
  const addButtons:HTMLButtonElement[]=[];
  function drawSaved(){
    const list=node('saved-positions');list.replaceChildren();moveButtons.length=0;addButtons.length=0;
    for(const pose of saved.list()){
      const row=document.createElement('li'),label=document.createElement('strong'),values=document.createElement('p'),remove=document.createElement('button');
      label.textContent=pose.name;
      values.textContent=pose.kind==='coordinates'
        ?`X ${pose.coordinates.x} · Y ${pose.coordinates.y} · Z ${pose.coordinates.z} · P ${pose.coordinates.pitch}° · R ${pose.coordinates.roll}° · C ${pose.coordinates.claw}°`
        :`Legacy joint position · ${pose.positions.map((value,i)=>`J${i+1}: ${value}`).join(' · ')}`;
      const issue=pose.kind!=='coordinates'?poseIssues(pose.positions).join(' '):'',warning=document.createElement('p');warning.className='note';warning.textContent=issue?`${issue} This legacy joint position is unchanged.`:'';warning.hidden=!issue;
      remove.textContent='Delete';remove.className='secondary';remove.setAttribute('aria-label',`Delete position ${pose.name}`);
      const move=document.createElement('button');move.textContent='Move to position';move.setAttribute('aria-label',`Move to position ${pose.name}`);
      move.onclick=()=>act(()=>{const control=getControl();if(!control)throw Error('Connect the robot.');if(pose.kind==='coordinates')control.moveToCoordinates({...pose.coordinates,durationMs:1500});else control.moveToPosition(pose.positions);});moveButtons.push({button:move,issue});
      const heading=document.createElement('div');heading.className='saved-position-heading';
      const add=document.createElement('button');add.className='secondary';add.textContent='+ Add to code';add.setAttribute('aria-label',`Add position ${pose.name} to code`);
      add.onclick=()=>document.dispatchEvent(new CustomEvent('add-position-to-code',{detail:pose.id}));addButtons.push(add);heading.append(label,add);
      const details=document.createElement('details');details.className='saved-position-details';
      const summary=document.createElement('summary');summary.textContent=pose.kind==='coordinates'?'XYZ/P/R/C values & movement':'Legacy joint values & movement';
      details.append(summary,values,move,remove);remove.onclick=()=>act(()=>{saved.remove(pose.id);drawSaved();});row.append(heading,warning,details);list.append(row);
    }
    const count=saved.list().length;
    node('pose-storage-status').textContent=`${count}/32 positions. ${count===32?'Export or delete an old position to record another. ':''}${saved.message}`;
    node<HTMLButtonElement>('pose-export').disabled=count===0;document.dispatchEvent(new Event('named-positions-changed'));
  }
  function act(action:()=>void){error='';try{action();}catch(caught){error=caught instanceof Error?caught.message:'Action could not complete.';}refresh(live,preparing);}
  function refresh(robotMode:boolean,isPreparing:boolean){
    live=robotMode;preparing=isPreparing;const state=getControl()?.snapshot();
    moveButtons.forEach(({button,issue})=>{button.disabled=!!issue||isPreparing||!state?.canMove;button.title=issue||state?.reason||'Calculate and check the exact coordinate endpoint, then make one coordinated joint-space move.';});
    addButtons.forEach(button=>button.disabled=isPreparing||!!state?.busy);
    jogButtons.forEach(button=>{button.disabled=isPreparing||!state?.canMove;button.title=state?.reason||'Move a small distance along one Cartesian axis after route preflight.';});
    node<HTMLButtonElement>('teach-release').disabled=isPreparing||!state?.canRelease;
    node('teach-release').title=state?.manualPhase==='Manual setup'?'Release was requested but physical holding is not measured. Support the arm and click to send Release again.':'Support the arm before releasing holding.';
    node<HTMLButtonElement>('teach-restore').disabled=isPreparing||!state?.canRestore;
    node<HTMLButtonElement>('teach-home').disabled=isPreparing||!state?.canRestoreAndHome;
    node<HTMLButtonElement>('pose-record').disabled=isPreparing||!state?.canCapture||!saved.canAdd||!name.value.trim();
    const text=state?.recovery?.active?state.recovery.message:state?.coordinate?state.message:state?.manualPhase==='Normal'?(state.feedbackFresh?'Live XYZ/P/R/C is ready for jogging or recording.':'Waiting for fresh coordinate readings.'):state?`${state.manualPhase}: ${state.manualMessage}${state.manualReason?` ${state.manualReason}`:''}`:'Connect for XYZ readings and position teaching.';
    if(node('teach-status').textContent!==text)node('teach-status').textContent=text;
    readings.forEach(({field,box,input,status})=>{
      const value=state?.reportedPose?.[field.key],invalid=value!==undefined&&(value<field.min||value>field.max);
      input.value=value===undefined?'—':String(value);input.setAttribute('aria-invalid',String(invalid));box.classList.toggle('out-of-range',invalid);
      status.textContent=value===undefined?'Waiting':invalid?'Outside input range':state?.feedbackFresh?'Live':'Last reading';
    });
    const jointIssues=jointReadings.flatMap(({joint,range,box,value,status})=>{
      const actual=state?.positions?.[joint-1],invalid=actual!==undefined&&(actual<range.min||actual>range.max);
      value.textContent=actual===undefined?'—':String(actual);box.classList.toggle('out-of-range',invalid);box.setAttribute('aria-invalid',String(invalid));
      status.textContent=actual===undefined?'Waiting':invalid?'OUTSIDE RANGE':state?.feedbackFresh?'In range':'Last reading';
      return invalid?[`J${joint} is ${actual}; accepted range is ${range.min}–${range.max}`]:[];
    });
    const jointInvalid=jointIssues.length>0,jointStatus=node('joint-safety-status');
    node('joint-safety').classList.toggle('out-of-range',jointInvalid);
    jointStatus.textContent=jointInvalid?`Cannot record this position. ${jointIssues.join('. ')}.`:state?.positions?(state.feedbackFresh?'All six joints are inside their accepted ranges.':'Showing the last joint readings; wait for fresh feedback.'):'Connect for live joint checks.';
    const coordinateInvalid=readings.some(({field})=>{const value=state?.reportedPose?.[field.key];return value!==undefined&&(value<field.min||value>field.max);});
    node('pose-recording').classList.toggle('out-of-range',coordinateInvalid||jointInvalid);
    const captureStatus=jointInvalid?`Cannot record: ${jointIssues.join('. ')}.`:coordinateInvalid?'Cannot record: one or more coordinates are outside the development input range.':isPreparing?'Wait for program preparation.':!state?.feedbackFresh?'Waiting for fresh live coordinate readings.':!state.canCapture?state.captureReason:!saved.canAdd?'Export or delete an old position before recording another.':!name.value.trim()?'Enter a position name to record this XYZ/P/R/C point.':'Ready to record this XYZ/P/R/C point.';
    node('pose-capture-status').textContent=captureStatus;node('teach-error').textContent=error;node('teach-error').hidden=!error;name.disabled=isPreparing||!!state?.busy;jogStep.disabled=isPreparing||!!state?.busy;
  }
  node('teach-release').onclick=()=>act(()=>getControl()?.setHolding(false,true));
  node('teach-restore').onclick=()=>act(()=>getControl()?.setHolding(true,true));
  node('pose-record').onclick=()=>act(()=>{const control=getControl();if(!control)throw Error('Connect to read robot coordinates.');saved.addCoordinates(name.value,control.captureCoordinates());name.value='';drawSaved();});
  for(const button of jogButtons)button.onclick=()=>act(()=>{
    const control=getControl();if(!control)throw Error('Connect the robot.');const axis=button.dataset.axis as 'x'|'y'|'z',direction=Number(button.dataset.direction),step=Number(jogStep.value);
    if(!['x','y','z'].includes(axis)||![-1,1].includes(direction)||!Number.isInteger(step)||step<1||step>25)throw Error('Choose a jog step from 1 to 25 mm.');control.jogCoordinate(axis,direction*step);
  });
  node('pose-clear').onclick=()=>act(()=>{saved.clear();drawSaved();});
  node('pose-export').onclick=()=>{const url=URL.createObjectURL(new Blob([saved.export()],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='nexarm-named-positions.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  name.oninput=()=>refresh(live,preparing);drawSaved();return {refresh,list:()=>saved.list(),replacePositions:(positions:unknown)=>{saved.replace(positions);error='';name.value='';drawSaved();refresh(live,preparing);}};
}
