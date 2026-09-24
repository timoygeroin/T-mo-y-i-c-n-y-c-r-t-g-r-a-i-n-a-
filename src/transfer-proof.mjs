import { proveCleanHostTransfer } from './transfer-harness.mjs';

const out=await proveCleanHostTransfer({
  baseUrl:process.env.MONDAYID_WORLDLINE_URL,
  token:process.env.MONDAYID_WORLDLINE_WRITER_TOKEN
});
console.log(JSON.stringify(out,null,2));
if(!out.ok) process.exit(1);
