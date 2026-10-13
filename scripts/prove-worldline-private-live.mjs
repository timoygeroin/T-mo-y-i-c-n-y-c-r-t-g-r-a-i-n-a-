// Negative integration proof. No privileged credential or private event data crosses CI.
const base=process.env.MONDAYID_WORLDLINE_URL || 'https://adamant-raven-783.eu-west-1.convex.site';
const endpoints=['/worldline/v4/snapshot?limit=1','/worldline/v4/event?eventId=anonymous-probe'];
for (const path of endpoints){
  const res=await fetch(new URL(path,base),{headers:{'cache-control':'no-store'}});
  if(res.status!==401){throw new Error('PRIVATE_WORLDLINE_ANONYMOUS_DENIAL_FAILED:'+res.status);}
}
console.log(JSON.stringify({ok:true,scope:'anonymous-denial-only',endpointCount:endpoints.length,privateEventsRead:0,authenticatedContinuity:'NOT_TESTED'}));
