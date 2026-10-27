import './styles.css';
import {ServoDiagnosticSession} from './robot/ServoDiagnosticSession';
import type {DiagnosticPort} from './robot/ServoDiagnosticSession';
const node=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const set=(id:string,text:string)=>{const el=node(id);if(el.textContent!==text)el.textContent=text;};
const serial=(navigator as Navigator&{serial?:{requestPort():Promise<DiagnosticPort>}}).serial;
const controller=serial&&navigator.locks?new ServoDiagnosticSession(navigator.locks,()=>performance.now(),()=>!document.hidden,refresh):null;
const hex=(bytes:readonly number[])=>bytes.map(n=>n.toString(16).padStart(2,'0')).join(' ');
const kinds=['factory-overload','factory-max-torque','position','identity','protection','status'];
const cards=Array.from({length:6},(_,i)=>{
  const card=document.createElement('article');card.className='joint-card';card.dataset.servo=String(i+1);
  const heading=document.createElement('h3');heading.textContent=`J${i+1}`;card.append(heading);
  const fields=kinds.map(kind=>{const p=document.createElement('p');p.dataset.readKind=kind;card.append(p);return p;});
  node('diag-joints').append(card);return fields;
});
function refresh(){
  const state=controller?.snapshot();
  node<HTMLButtonElement>('diag-connect').disabled=!controller||!state?.canConnect;
  node<HTMLButtonElement>('diag-read').disabled=!state?.canStart;
  node<HTMLButtonElement>('diag-stop').disabled=!state?.canStop;
  node<HTMLButtonElement>('diag-disconnect').disabled=!state||['Disconnected','Closing'].includes(state.connectionState);
  node<HTMLButtonElement>('diag-export').disabled=!state?.canExport;
  node<HTMLProgressElement>('diag-progress').value=state?.completed??0;
  node<HTMLProgressElement>('diag-progress').max=state?.total??49;
  set('diag-state',state?`${state.connectionState} · ${state.phase} · ${state.message}`:'Diagnostics require Chrome or Edge with Web Serial and exclusive tab locks on HTTPS or localhost.');
  const results=state?.results??[],version=results.find(r=>r.kind==='controller-version');
  set('diag-controller',version?`Controller version: ${version.decoded?.esp32Version?`ESP32 ${version.decoded.esp32Version}${version.decoded.at32Version?`; AT32 ${version.decoded.at32Version}`:''}`:version.payload?`raw ${hex(version.payload)}`:version.outcome}.`:'Controller version: not read.');
  set('diag-passive',state?.passive?`Passive joint feedback (${state.passive.fresh?'recent':'last report'}): ${state.passive.positions.join(', ')}.`:'Passive joint feedback: not received. A read scan does not require this stream.');
  set('diag-summary',state?.canExport?`${state.completed}/${state.total} requests resolved: ${results.filter(r=>r.outcome==='data').length} data replies, ${results.filter(r=>r.outcome==='device-error').length} device-error replies, ${results.filter(r=>r.outcome==='timeout').length} timeouts, ${results.filter(r=>r.outcome==='skipped').length} skipped. No protection rating is inferred.`:'No read requests sent.');
  set('diag-capture',state?.canExport?`Raw receive capture: ${state.rawReceive.capturedBytes} bytes in ${state.rawReceive.chunks} chunks${state.rawReceive.truncated?`; capture limited, ${state.rawReceive.omittedBytes} bytes omitted`:''}. Included in the local export; no additional robot requests.`:'Raw receive capture starts only with Read diagnostics and stops with the scan.');
  cards.forEach((fields,i)=>kinds.forEach((kind,j)=>{
    const r=results.filter(r=>r.servo===i+1&&r.kind===kind).at(-1),d=r?.decoded;
    let text=`${kind}: not read.`;
    if(r){
      text=`${kind}${r.sample?` sample ${r.sample}`:''}: ${r.outcome}. ${r.note}`;
      if(d&&kind==='factory-overload')text+=` Factory raw values: post-overload cap ${d.postOverloadTorqueByteRaw}; delay ${d.overloadDelayByteRaw}; threshold ${d.overloadThresholdByteRaw??'not supplied'}. This is configuration, not a live alarm.`;
      if(d&&kind==='factory-max-torque')text+=` Factory raw maximum torque ${d.maxTorqueRaw}. A zero value's meaning remains unverified.`;
      if(d&&kind==='position')text+=` Direct position raw ${d.positionRaw}. This tests the register-read path only.`;
      if(d&&kind==='identity')text+=` Firmware bytes ${hex(d.firmwareBytes as number[])}; unmapped model code 0x${Number(d.modelCodeRaw).toString(16).padStart(4,'0')}.`;
      if(d&&kind==='protection')text+=` Provisional raw fields: protection byte ${d.protectionControlByteRaw}; overload-cap byte ${d.postOverloadTorqueByteRaw}; delay byte ${d.overloadDelayByteRaw}; threshold bytes ${hex(d.overloadThresholdBytesRaw as number[])}. Units/enabled state are not verified.`;
      if(d&&kind==='status')text+=` Provisional raw fields: position ${d.positionRaw}; speed ${d.speedRaw}; load ${d.loadRaw}; motor current ${d.currentRaw}; status byte 0x${Number(d.statusByteRaw).toString(16).padStart(2,'0')}; voltage byte ${d.voltageByteRaw}; temperature byte ${d.temperatureByteRaw}.${d.allBytesZero?' All status bytes are zero; do not treat this as healthy feedback.':''}`;
    }
    if(fields[j]!.textContent!==text)fields[j]!.textContent=text;
  }));
  set('diag-raw',results.length?JSON.stringify(results.map(r=>({read:r.key,outcome:r.outcome,request:hex(r.requestBytes),response:r.payload===null?null:hex(r.payload),errorByte:r.errorByte,elapsedMs:r.elapsedMs,note:r.note})),null,2):'No requests sent.');
}
const showError=(error:unknown)=>{node('diag-error').hidden=false;set('diag-error',error instanceof Error?error.message:'Diagnostic operation failed.');refresh();};
node('diag-connect').onclick=()=>{try{if(controller&&serial){node('diag-error').hidden=true;controller.connect(()=>serial.requestPort());}}catch(error){showError(error);}};
node('diag-read').onclick=()=>{try{node('diag-error').hidden=true;controller?.start();}catch(error){showError(error);}};
node('diag-stop').onclick=()=>controller?.stop();node('diag-disconnect').onclick=()=>controller?.disconnect();
node('diag-export').onclick=()=>{
  if(!controller?.snapshot().canExport)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(controller.report(),null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='nexarm-read-only-servo-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)controller?.disconnect();});
window.addEventListener('pagehide',()=>controller?.disconnect());window.addEventListener('error',()=>controller?.disconnect());window.addEventListener('unhandledrejection',()=>controller?.disconnect());
setInterval(()=>{controller?.tick();refresh();},50);refresh();
