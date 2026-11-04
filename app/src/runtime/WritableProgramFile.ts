/** Chromium's user-approved local file access. Robot and program execution are not involved. */
export type ProgramFileHandle={
  readonly name:string;
  getFile():Promise<File>;
  createWritable():Promise<{write(data:string):Promise<void>;close():Promise<void>;abort?():Promise<void>}>;
  queryPermission?(options:{mode:'readwrite'}):Promise<'granted'|'denied'|'prompt'>;
  requestPermission?(options:{mode:'readwrite'}):Promise<'granted'|'denied'|'prompt'>;
};

type FilePickerWindow=Window&{
  showSaveFilePicker?(options:{suggestedName:string;types:{description:string;accept:Record<string,string[]>}[]}):Promise<ProgramFileHandle>;
  showOpenFilePicker?(options:{multiple:false;types:{description:string;accept:Record<string,string[]>}[]}):Promise<ProgramFileHandle[]>;
};

const types=[{description:'NexArm Classroom program',accept:{'application/json':['.json']}}];

export function writableProgramFilesSupported(target:Window=window):boolean{
  const candidate=target as FilePickerWindow;
  return typeof candidate.showSaveFilePicker==='function'&&typeof candidate.showOpenFilePicker==='function';
}

export async function chooseProgramFileToSave(suggestedName:string,target:Window=window):Promise<ProgramFileHandle>{
  const picker=(target as FilePickerWindow).showSaveFilePicker;
  if(!picker)throw Error('Direct file saving is not supported in this browser.');
  return picker.call(target,{suggestedName,types});
}

export async function chooseProgramFileToOpen(target:Window=window):Promise<ProgramFileHandle>{
  const picker=(target as FilePickerWindow).showOpenFilePicker;
  if(!picker)throw Error('Direct file opening is not supported in this browser.');
  const [handle]=await picker.call(target,{multiple:false,types});
  if(!handle)throw Error('No program file was selected.');
  return handle;
}

export function filePickerCanceled(error:unknown):boolean{
  return error instanceof DOMException&&error.name==='AbortError';
}

export async function writeProgramFile(handle:ProgramFileHandle,text:string):Promise<void>{
  if(handle.queryPermission&&await handle.queryPermission({mode:'readwrite'})==='denied')throw Error(`Writing ${handle.name} is no longer allowed. Choose Save as new file to continue.`);
  const writable=await handle.createWritable();
  try{await writable.write(text);await writable.close();}
  catch(error){try{await writable.abort?.();}catch{}throw error;}
}
