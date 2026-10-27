import type {ReportedPose} from '../protocol/FrameParser';

type CoordinateState={connectionState:string;feedbackFresh:boolean;reportedPose:ReportedPose|null};

export function createReportedCoordinatesPanel(container:HTMLElement){
  container.classList.add('reported-coordinates');
  const heading=document.createElement('h3');heading.id=`${container.id}-heading`;heading.textContent='Controller-reported XYZ / P / R / C';
  container.setAttribute('role','group');container.setAttribute('aria-labelledby',heading.id);
  const status=document.createElement('p');status.dataset.coordinateStatus='';status.setAttribute('role','status');
  const readings=document.createElement('dl');readings.className='coordinate-readings';
  const fields=[['x','X (mm)'],['y','Y (mm)'],['z','Z (mm)'],['pitch','P · Pitch (°)'],['roll','R · Roll (°)'],['claw','C · Claw (°)']] as const;
  const values=fields.map(([axis,title])=>{
    const cell=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');
    label.textContent=title;value.dataset.reportedAxis=axis;value.textContent='—';cell.append(label,value);readings.append(cell);
    return {axis,value};
  });
  const note=document.createElement('p');note.className='note';
  note.textContent='P: gripper tilt. R: gripper rotation. C: gripper opening angle. Read-only factory values in mm/degrees; compare with the robot LCD. Zero point, axis directions, and gripper reference point still need verification.';
  container.append(heading,status,readings,note);
  function refresh(state:CoordinateState|null|undefined){
    const xyz=state?.reportedPose,connected=state?.connectionState==='Listening',fresh=!!xyz&&!!state?.feedbackFresh;
    container.dataset.fresh=String(fresh);
    const message=xyz?(fresh?'Live report · compare with the robot LCD or factory app.':connected?'Last report · stale; waiting for fresh data.':'Disconnected · last report, not current.'):
      connected?'Waiting for the first valid coordinate report.':'Connect to see controller-reported coordinates.';
    if(status.textContent!==message)status.textContent=message;
    for(const {axis,value} of values){const text=xyz?String(xyz[axis]):'—';if(value.textContent!==text)value.textContent=text;}
  }
  refresh(null);return {refresh};
}
