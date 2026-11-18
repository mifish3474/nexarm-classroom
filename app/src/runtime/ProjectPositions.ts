import {copyProject} from './ProgramProject';
import type {ProgramProject} from './ProgramProject';
import type {Instruction} from './ProgramLanguage';
import {ProgramError} from './ProgramLanguage';
import {copyNamedPositions} from '../poses/NamedPositions';
import type {NamedPosition} from '../poses/NamedPositions';

/** A single project-owned library. Older files can recover only embedded poses. */
export function resolveProjectPositions(input:ProgramProject,allowUnassigned=false):ProgramProject&{positions:NamedPosition[]}{
  const project=copyProject(input,allowUnassigned),explicit=project.positions!==undefined;
  const positions=copyNamedPositions(project.positions??[]),ids=new Set(positions.map(p=>p.id)),names=new Set(positions.map(p=>p.name.toLowerCase()));
  const imported=new Map<string,NamedPosition>();
  function visit(nodes:Instruction[]){
    for(const node of nodes){
      if(node.kind==='repeat')visit(node.body);
      else if(node.kind==='if'){node.branches.forEach(branch=>visit(branch.body));visit(node.elseBody);}
      else if(node.kind==='pose'){
        if(explicit){
          const pose=positions.find(p=>p.id===node.positionId);
          if(!pose||pose.name!==node.name||pose.positions.some((n,i)=>n!==node.positions[i]))throw new ProgramError(`Position "${node.name}" does not match this program's saved positions. The file was not loaded.`,node.blockId);
          continue;
        }
        const signature=JSON.stringify([node.positionId,node.name,node.positions]);let pose=imported.get(signature);
        if(!pose){
          if(positions.length>=32)throw Error('This program contains more than 32 saved positions.');
          let id=node.positionId,index=1;while(ids.has(id))id=`file-position-${index++}`;
          const baseName=node.name.trim();let name=baseName,indexName=2;
          while(names.has(name.toLowerCase())){const suffix=` (${indexName++})`;name=baseName.slice(0,40-suffix.length)+suffix;}
          // Old instruction snapshots have no capture time; epoch means unknown.
          pose={id,name,positions:[...node.positions],capturedAt:'1970-01-01T00:00:00.000Z'};
          positions.push(pose);ids.add(id);names.add(name.toLowerCase());imported.set(signature,pose);
        }
        node.positionId=pose.id;node.name=pose.name;
      }
    }
  }
  visit(project.instructions);project.keyEvents.forEach(event=>visit(event.body));project.functions?.forEach(fn=>visit(fn.body));
  return {...project,positions};
}
