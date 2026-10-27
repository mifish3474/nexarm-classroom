/** Interface navigation only. This module never requests USB or sends commands. */
export function setupWorkspace(){
  const tabs=[...document.querySelectorAll<HTMLButtonElement>('.inspector-tabs [role=tab]')];
  function select(tab:HTMLButtonElement,focus=false){
    for(const item of tabs){
      const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;
      document.getElementById(item.getAttribute('aria-controls')!)!.hidden=!selected;
    }
    if(focus)tab.focus();
  }
  tabs.forEach(tab=>{
    tab.onclick=()=>select(tab);
    tab.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      select(tabs[index]!,true);
    };
  });
  const menus=[...document.querySelectorAll<HTMLDetailsElement>('.workspace-menu')];
  function fit(menu:HTMLDetailsElement){
    const popup=menu.querySelector<HTMLElement>('.menu-content');if(!popup)return;
    const header=document.querySelector('.workspace-header')!.getBoundingClientRect(),summary=menu.querySelector('summary')!.getBoundingClientRect();
    const room=innerWidth<=850?innerHeight-header.bottom-32:menu.closest('.workspace-editor-tools')?summary.top-header.bottom-16:innerHeight-summary.bottom-16;
    popup.style.maxHeight=`${Math.max(80,Math.min(innerHeight*.65,room))}px`;
  }
  function close(menu:HTMLDetailsElement,restoreFocus=false){
    if(!menu.open)return;
    if(restoreFocus&&menu.contains(document.activeElement))menu.querySelector<HTMLElement>('summary')!.focus();
    menu.open=false;
  }
  menus.forEach(menu=>{
    menu.addEventListener('toggle',()=>{if(menu.open){fit(menu);menus.forEach(other=>{if(other!==menu)close(other);});}});
    menu.addEventListener('click',event=>{if((event.target as HTMLElement).closest('button'))close(menu,true);});
    menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(menu,true);}});
    menu.addEventListener('focusout',event=>{if(event.relatedTarget&&!menu.contains(event.relatedTarget as Node))close(menu);});
  });
  document.addEventListener('pointerdown',event=>menus.forEach(menu=>{if(!menu.contains(event.target as Node))close(menu);}));
  window.addEventListener('resize',()=>menus.filter(menu=>menu.open).forEach(fit));
}
