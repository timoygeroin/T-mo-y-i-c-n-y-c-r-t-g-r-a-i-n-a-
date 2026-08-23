export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'mondayid-connector',
    version: '1.1.0',
    mcp: '/mcp',
    architecture: 'dima-twin+lineage-council+antisystem+receipt-readback',
  });
}
