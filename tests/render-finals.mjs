import { compileFinalChallengeSource } from '../packages/challenge-spec/index.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const specs = JSON.parse(input);
console.log('pdf(tempfile(fileext = ".pdf"))');
for (const spec of specs) console.log(compileFinalChallengeSource(spec));
console.log('dev.off()');
