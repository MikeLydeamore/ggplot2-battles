import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const output = resolve(here, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(here, 'site'), output, { recursive: true });
await cp(resolve(here, 'src'), resolve(output, 'src'), { recursive: true });
await cp(resolve(root, 'packages/challenge-spec'), resolve(output, 'shared/challenge-spec'), { recursive: true });
await cp(resolve(root, 'packages/battle-engine'), resolve(output, 'shared/battle-engine'), { recursive: true });
await cp(resolve(root, 'js'), resolve(output, 'js'), { recursive: true });
await cp(resolve(root, 'theme.css'), resolve(output, 'theme.css'));
await cp(resolve(root, 'logo.png'), resolve(output, 'logo.png'));
await cp(resolve(root, 'favicon.ico'), resolve(output, 'favicon.ico'));

const viewer = await readFile(resolve(root, 'js/editor-viewer.html'), 'utf8');
const editorOnly = viewer.split('<div class="leaderboard-wrapper">')[0].trimEnd();
await writeFile(resolve(output, 'js/editor-viewer.html'), `${editorOnly}\n`, 'utf8');

console.log(`Built Archipelago client in ${output}`);
