import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';

const {version}=JSON.parse(readFileSync('package.json','utf8'));
copyFileSync('CNAME','dist/CNAME');
writeFileSync('dist/.nojekyll','');
writeFileSync('dist/deployment.json',JSON.stringify({version,commit:process.env.GITHUB_SHA??null,builtAt:new Date().toISOString()},null,2)+'\n');
