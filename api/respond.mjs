import { runChatHost } from '../src/chat-host-adapter.mjs';

function authorized(req) {
  const expected=process.env.MONDAYID_HOST_TOKEN;
  if (!expected) return false;
  const header=String(req.headers?.authorization || '');
  return header === `Bearer ${expected}`;
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow','POST');
    return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
  }

  if (!authorized(req)) {
    return res.status(401).json({ok:false,code:'HOST_AUTH_REQUIRED'});
  }

  const body=req.body && typeof req.body === 'object' ? req.body : {};
  const text=String(body.text || '');
  if (!text.trim()) {
    return res.status(400).json({ok:false,code:'TEXT_REQUIRED'});
  }

  const out=await runChatHost({signal:{...body,text}});
  return res.status(out.ok ? 200 : (out.status || 503)).json(out);
}
