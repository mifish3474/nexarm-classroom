import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('app/public/blockly-media', { recursive: true });
cpSync('node_modules/blockly/media', 'app/public/blockly-media', { recursive: true });
