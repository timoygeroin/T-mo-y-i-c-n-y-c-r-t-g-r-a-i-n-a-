import { simulateDeus0 } from '../src/deus-zero.mjs';

const MAX_BYTES = 12_000;
const MAX_NODES = 256;
const MAX_HORIZON = 6;
const MAX_ACTIONS = 12;
const MAX_DIMENSIONS = 8;

const reply = (res, status, data) => res.status(status).json(data);
const error = (res, status, code) => reply(res, status, {ok:false,code});

function constrainedModel(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('MODEL_REQUIRED');
  if (Object.keys(value).some(key => !['id','initial','goals','constraints','actions','horizon','maxNodes'].includes(key))) {
    throw Error('UNKNOWN_MODEL_FIELD');
  }
  if (!Array.isArray(value.actions) || value.actions.length > MAX_ACTIONS) throw Error('ACTION_BUDGET_EXCEEDED');
  if (!value.initial || Array.isArray(value.initial) || Object.keys(value.initial).length > MAX_DIMENSIONS) {
    throw Error('DIMENSION_BUDGET_EXCEEDED');
  }
  const horizon = value.horizon ?? 4;
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON) throw Error('HORIZON_BUDGET_EXCEEDED');
  const maxNodes = value.maxNodes ?? MAX_NODES;
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_NODES) throw Error('NODE_BUDGET_EXCEEDED');
  return {...value,horizon,maxNodes};
}

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
    const report = simulateDeus0(constrainedModel(body.model));
    return reply(res,200,{ok:true,report});
  } catch (cause) {
    const message=String(cause?.message || '');
    const code=/^(?:DEUS0_[A-Z_]+|[A-Z_]+)$/.test(message) ? message : 'INVALID_MODEL';
    return error(res,400,code);
  }
}
