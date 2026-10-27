export const KEY_OPTIONS:[string,string][]=[
  ['Space','space'],['↑ arrow','up'],['↓ arrow','down'],['← arrow','left'],['→ arrow','right'],
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split('').map(key=>[key.toUpperCase(),key] as [string,string]),
];
export const keyLabel=(key:string)=>KEY_OPTIONS.find(option=>option[1]===key)?.[0]??key;
export const isEventKey=(value:unknown):value is string=>typeof value==='string'&&KEY_OPTIONS.some(option=>option[1]===value);
function eventKey(key:string):string|null{
  const mapped:Record<string,string>={' ':'space',Spacebar:'space',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
  const value=mapped[key]??key.toLowerCase();return isEventKey(value)?value:null;
}

/** One physical press, one accepted activation. Never queue or repeat a press. */
export class KeyboardEvents {
  private keys=new Set<string>();
  private held=new Set<string>();
  get active(){return this.keys.size>0;}
  start(keys:readonly string[]){this.keys=new Set(keys.filter(isEventKey));}
  stop(){this.keys.clear();}
  releaseAll(){this.held.clear();}
  keyup(event:Pick<KeyboardEvent,'key'>){const key=eventKey(event.key);if(key)this.held.delete(key);}
  keydown(event:Pick<KeyboardEvent,'key'|'repeat'|'ctrlKey'|'altKey'|'metaKey'|'shiftKey'|'isComposing'|'defaultPrevented'|'preventDefault'>,context:{canMove:boolean;busy:boolean;editing:boolean;visible:boolean}):string|null{
    const key=eventKey(event.key);if(!key)return null;
    const alreadyHeld=this.held.has(key);this.held.add(key);
    if(!this.active||!this.keys.has(key)||event.repeat||alreadyHeld||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.isComposing||event.defaultPrevented||context.editing||!context.visible)return null;
    // Consume a bound key in the control area even if the robot cannot accept it.
    event.preventDefault();
    if(context.busy||!context.canMove)return null;
    return key;
  }
}

export function isKeyboardEditing(target:EventTarget|null):boolean{
  if(!(target instanceof Element))return false;
  return !!target.closest('input,textarea,select,button,summary,a,[contenteditable],dialog,#blockly-editor,#keyboard-fields,.blocklyWidgetDiv,.blocklyDropDownDiv');
}
