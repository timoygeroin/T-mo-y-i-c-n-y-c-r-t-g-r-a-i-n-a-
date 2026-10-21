import { authorizationServerMetadata } from '../../src/oauth-as.mjs';

export default function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=60');
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method!=='GET' && req.method!=='HEAD'){
    res.setHeader('Allow','GET, HEAD');
    return res.status(405).json({error:'method_not_allowed'});
  }
  return res.status(200).json(authorizationServerMetadata(process.env,req));
}
