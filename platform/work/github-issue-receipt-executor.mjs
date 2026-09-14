import { createHash, randomUUID } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function githubRequest({ apiBase, token, path, method = 'GET', body }) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'MondayID-Execution-Runtime/1.0',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) throw new Error(`GitHub ${method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
  return payload;
}

export async function executeVerifiedIssueReceipt({ apiBase = 'https://api.github.com', token, repository, issueNumber, objective, sourceSignal, evidence }) {
  if (!token) throw new Error('token required');
  if (!repository || !/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repository)) throw new Error('repository must be owner/name');
  if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error('issueNumber must be positive integer');
  if (typeof objective !== 'string' || !objective) throw new Error('objective required');
  if (typeof sourceSignal !== 'string' || !sourceSignal) throw new Error('sourceSignal required');
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error('evidence required');

  const [owner, repo] = repository.split('/');
  const issuePath = `/repos/${owner}/${repo}/issues/${issueNumber}`;
  const issue = await githubRequest({ apiBase, token, path: issuePath });
  if (issue.state !== 'open') throw new Error(`target issue is not open: ${issue.state}`);

  const receiptId = `monday-real-task:${randomUUID()}`;
  const sourceSha256 = digest(sourceSignal);
  const evidenceSha256 = digest(JSON.stringify(evidence));
  const marker = `<!-- ${receiptId} -->`;
  const body = [
    marker,
    '### Monday runtime — verified external task receipt',
    '',
    `- **Objective:** ${objective}`,
    `- **Truth path:** GENERATED → EXECUTED → READ BACK → VERIFIED`,
    `- **Source signal SHA-256:** \`${sourceSha256}\``,
    `- **Evidence SHA-256:** \`${evidenceSha256}\``,
    `- **Target:** issue #${issueNumber}`,
    '',
    'This receipt was created by the execution runtime as an external GitHub effect and was promoted to VERIFIED only after the created comment was fetched back and matched exactly.',
  ].join('\n');

  const created = await githubRequest({
    apiBase,
    token,
    path: `${issuePath}/comments`,
    method: 'POST',
    body: { body },
  });
  if (!created?.id) throw new Error('GitHub returned no comment id');

  const readback = await githubRequest({
    apiBase,
    token,
    path: `/repos/${owner}/${repo}/issues/comments/${created.id}`,
  });
  const accepted = readback?.body === body && readback?.issue_url?.endsWith(`/issues/${issueNumber}`);
  if (!accepted) throw new Error('external readback mismatch; receipt is not verified');

  return Object.freeze({
    status: 'verified',
    receiptId,
    objective,
    sourceSha256,
    evidenceSha256,
    effect: { type: 'github_issue_comment', commentId: created.id, url: created.html_url },
    readback: { accepted: true, commentId: readback.id, bodySha256: digest(readback.body), markerFound: readback.body.includes(marker) },
  });
}
