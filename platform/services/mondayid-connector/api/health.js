export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'mondayid-connector',
    version: '1.0.0',
    mcp: '/mcp',
    architecture: 'lineage-council+antisystem+receipt-readback',
  });
}
