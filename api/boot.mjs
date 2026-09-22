import { bootHost } from '../src/host-adapter.mjs';

export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const out = await bootHost();
  res.status(out.ok ? 200 : (out.status || 503)).json(out);
}
