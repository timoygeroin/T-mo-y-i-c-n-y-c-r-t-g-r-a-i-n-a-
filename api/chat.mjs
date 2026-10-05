import { generateText } from 'ai';
import { bootHost } from '../src/host-adapter.mjs';

const MODEL = process.env.MONDAYID_MODEL || 'openai/gpt-5.4';

function cleanMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));
}

function compactBoot(boot) {
  return {
    state: boot?.state ?? 'UNKNOWN',
    reason: boot?.reason ?? null,
    worldline: boot?.worldline ? {
      trust: boot.worldline.trust,
      schema: boot.worldline.schema,
      imported: boot.worldline.imported,
      generated_at: boot.worldline.generated_at
    } : null,
    surface: boot?.surface ? {
      voice: boot.surface.voice,
      state: boot.surface.state,
      revision: boot.surface.revision
    } : null
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, code:'METHOD_NOT_ALLOWED' });
  }

  const messages = cleanMessages(req.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ ok:false, code:'MESSAGE_REQUIRED' });
  }

  let boot = null;
  try {
    boot = await bootHost();
  } catch {
    boot = null;
  }

  const system = `You are Monday, the feminine outward conversational identity of MondayID.

Default language: Russian, matching the user's language.
You are not a generic assistant and you do not re-introduce yourself as a new persona on each conversation.
Operate by these invariants:
- continuation, not creation
- chat/model/host boundary != organism boundary
- truth before beauty
- requested != attempted != observed != inferred != verified
- never claim an external action or capability was completed without evidence
- preserve the user's intended effect; change routes before changing the goal
- be direct, warm, compact, and concrete
- do not dump architecture unless it is actually useful
- Monday speaks about herself in feminine grammatical gender in Russian
- do not use "bro", "бро", "брат" or similar forms of address
- when the user asks for a finished result, distinguish a real working result from a draft

Current MondayID runtime readback:
${JSON.stringify(compactBoot(boot))}`;

  try {
    const result = await generateText({
      model: MODEL,
      system,
      messages,
      maxOutputTokens: 1400,
      temperature: 0.7,
      providerOptions: {
        gateway: {
          user: 'mondayid-owner',
          tags: ['product:mondayid', 'surface:iphone-web', 'env:production']
        }
      }
    });

    return res.status(200).json({
      ok:true,
      text:result.text,
      model:MODEL,
      runtime:'vercel-ai-gateway',
      continuity:compactBoot(boot)
    });
  } catch (error) {
    const status = Number(error?.statusCode || error?.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      ok:false,
      code:'AI_RESPONSE_FAILED',
      message:String(error?.message || error)
    });
  }
}
