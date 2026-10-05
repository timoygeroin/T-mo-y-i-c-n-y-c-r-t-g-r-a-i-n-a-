import { describeHost } from '../src/host-adapter.mjs';
import { describeWorkReadiness } from '../src/work-readiness.mjs';

export default async function handler(_req,res){
  res.setHeader('Cache-Control','no-store');
  const host=describeHost();
  res.status(200).json({
    ok:true,
    product:'Monday Work',
    transport:{
      mcp:'/api/mcp',
      health:'/api/health',
      status:'/api/status'
    },
    host,
    work:describeWorkReadiness(),
    selfCheck:{
      health:'PASS',
      mcpEndpoint:'PENDING_EXTERNAL_READBACK',
      initialize:'PENDING_EXTERNAL_READBACK',
      toolsList:'PENDING_EXTERNAL_READBACK',
      toolsCall:'PENDING_EXTERNAL_READBACK'
    }
  });
}
