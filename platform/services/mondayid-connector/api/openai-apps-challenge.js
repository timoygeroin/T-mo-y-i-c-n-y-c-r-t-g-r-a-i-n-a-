export default function handler(_req,res){
  const token=process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  if(!token){
    res.status(404).setHeader('content-type','text/plain; charset=utf-8').send('challenge-not-configured');
    return;
  }
  res.status(200).setHeader('content-type','text/plain; charset=utf-8').send(token);
}
