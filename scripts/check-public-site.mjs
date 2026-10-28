import {readFileSync} from 'node:fs';
import {setTimeout} from 'node:timers/promises';

const base=new URL(process.argv[2]),{version}=JSON.parse(readFileSync('package.json','utf8'));
if(base.protocol!=='https:'||base.hostname!=='nexarm.mrfish.app')throw Error('Expected the classroom public HTTPS site.');
async function get(path){
  const url=new URL(path,base);url.searchParams.set('check',process.env.GITHUB_SHA??String(Date.now()));
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);
  return response;
}
let error;
for(let attempt=0;attempt<18;attempt++){
  try{
    const metadata=await (await get('deployment.json')).json();
    if(metadata.version!==version||process.env.GITHUB_SHA&&metadata.commit!==process.env.GITHUB_SHA)throw Error('Waiting for the expected version and commit to reach the public site.');
    const html=await (await get('')).text();
    if(!html.includes(version)||!html.includes('id="project-name"')||!html.includes('id="teach-home"'))throw Error('The public entry point is not the expected classroom app.');
    const assets=[...html.matchAll(/(?:src|href)="(\.\/assets\/[^"<>]+)"/g)].map(match=>match[1]);
    if(!assets.length)throw Error('No built application assets were found.');
    for(const path of assets){const response=await get(path);if((response.headers.get('content-type')??'').includes('text/html'))throw Error(`${path}: received HTML instead of an application asset.`);}
    for(const path of ['mapping.html','mapping-tests.html','commissioning.html','servo-diagnostics.html'])if(!(await (await get(path)).text()).includes(version))throw Error(`${path}: version is missing.`);
    console.log(`Verified ${base.href} at ${version}, commit ${metadata.commit}; application assets and setup pages respond.`);
    process.exit(0);
  }catch(reason){error=reason;console.log(`Public check ${attempt+1}/18: ${reason instanceof Error?reason.message:String(reason)}`);if(attempt<17)await setTimeout(10000);}
}
throw error;
