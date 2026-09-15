import fs from 'node:fs';
import { compileOrganismMove } from './runtime.mjs';

const inputText = process.argv[2]
  ? fs.readFileSync(process.argv[2], 'utf8')
  : fs.readFileSync(0, 'utf8');

let input;
try {
  input = JSON.parse(inputText);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: `INVALID_JSON: ${error.message}` }));
  process.exit(2);
}

try {
  const result = compileOrganismMove(input);
  process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
}
