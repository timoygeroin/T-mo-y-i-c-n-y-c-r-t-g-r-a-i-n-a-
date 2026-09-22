import { describeHost } from '../src/host-adapter.mjs';

export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(describeHost());
}
