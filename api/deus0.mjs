import { simulateBoundedDeus0, DEUS_LIMITS, deus0ErrorCode } from '../src/deus-zero-access.mjs';

const {maxBytes:MAX_BYTES,maxNodes:MAX_NODES,maxActions:MAX_ACTIONS,maxDimensions:MAX_DIMENSIONS}=DEUS_LIMITS;
const reply = (res, status, data) => res.status(status).json(data);
const error = (res, status, code) => reply(res, status, {ok:false,code});

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method === 'GET') {
    return reply(res,200,{
      ok:true,organ:'DEUS-0',schema:'mondayid.deus0.http.v1',
      execution:'bounded-counterfactual-only',
      networkSideEffects:false,persistence:false,externalReadback:false,
      maxNodes:MAX_NODES,maxActions:MAX_ACTIONS,maxDimensions:MAX_DIMENSIONS,
      requires:'POST with {model}, numeric bounded assumptions'
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow','GET, POST');
    return error(res,405,'METHOD_NOT_ALLOWED');
  }
  const contentType = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return error(res,415,'JSON_REQUIRED');
  const reportedBytes = Number(req.headers?.['content-length'] || 0);
  if (reportedBytes > MAX_BYTES) return error(res,413,'REQUEST_TOO_LARGE');

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key => key !== 'model')) throw Error('MODEL_WRAPPER_REQUIRED');
    if (Buffer.byteLength(JSON.stringify(body),'utf8') > MAX_BYTES) return error(res,413,'REQUEST_TOO_LARGE');
    const report = simulateBoundedDeus0(body.model);
    return reply(res,200,{ok:true,report});
  } catch (cause) {
    const code=deus0ErrorCode(cause);
    return error(res,400,code);
  }
}
