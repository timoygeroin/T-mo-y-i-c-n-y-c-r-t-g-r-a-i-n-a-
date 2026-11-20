import {createWorldlineV4Server} from './worldline-v4-server.mjs';
const file=process.env.MONDAYID_WORLDLINE_FILE;
const writerToken=process.env.MONDAYID_WORLDLINE_WRITER_TOKEN;
const readerToken=process.env.MONDAYID_WORLDLINE_READ_TOKEN;
const host=process.env.MONDAYID_WORLDLINE_HOST||'127.0.0.1';
const port=Number(process.env.MONDAYID_WORLDLINE_PORT||7777);
if(!file||!writerToken||!readerToken||!Number.isInteger(port)||port<0||port>65535){
  console.error('Worldline requires persistent file, distinct writer/read tokens, and valid port');
  process.exit(2);
}
const server=createWorldlineV4Server({file,writerToken,readerToken});
server.on('error',err=>{console.error('Worldline listen failed: '+err.code);process.exit(1);});
server.listen(port,host,()=>console.log('WORLDLINE_READY '+JSON.stringify({url:`http://${host}:${server.address().port}`,persistent:true,authenticated:true})));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));