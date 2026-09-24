import crypto from 'node:crypto';

const stable = value => JSON.stringify(value, Object.keys(value || {}).sort());
const fingerprint = value => crypto.createHash('sha256').update(stable(value)).digest('hex').slice(0,16);

function requestOf(action, key) {
  return action?.routeCandidate?.[key] ?? action?.[key] ?? null;
}

function acceptanceOf(action) {
  return action?.routeCandidate?.acceptance ?? action?.acceptance ?? null;
}

function distinctRequests(executionRequest, verificationRequest) {
  return fingerprint(executionRequest) !== fingerprint(verificationRequest);
}

function acceptancePasses(readback, acceptance = {}) {
  if (readback?.status !== 'completed' || readback?.exitCode !== 0) return false;
  if (Object.hasOwn(acceptance,'stdoutEquals') && readback.stdout !== acceptance.stdoutEquals) return false;
  if (acceptance.stdoutIncludes && !String(readback.stdout).includes(String(acceptance.stdoutIncludes))) return false;
  if (acceptance.stderrEmpty === true && String(readback.stderr || '') !== '') return false;
  return true;
}

export function createProcessComputerReceptor({ executor, name = 'mondayid-process-computer' } = {}) {
  if (!executor || typeof executor.run !== 'function') {
    throw new TypeError('process computer receptor requires executor.run()');
  }

  return Object.freeze({
    name,
    exposes:['workspace.execute','shell.execute','python.execute','independent.readback'],
    cost:1,

    supports(action) {
      const executionRequest = requestOf(action,'executionRequest');
      const verificationRequest = requestOf(action,'verificationRequest');
      const acceptance = acceptanceOf(action);
      return Boolean(
        ['code','host','general'].includes(action?.domain) &&
        executionRequest &&
        verificationRequest &&
        acceptance &&
        distinctRequests(executionRequest,verificationRequest)
      );
    },

    async execute(action) {
      const executionRequest = requestOf(action,'executionRequest');
      const verificationRequest = requestOf(action,'verificationRequest');
      const acceptance = acceptanceOf(action);

      if (!executionRequest || !verificationRequest || !acceptance) {
        return {ok:false,code:'COMPUTER_CONTRACT_INCOMPLETE'};
      }
      if (!distinctRequests(executionRequest,verificationRequest)) {
        return {ok:false,code:'COMPUTER_READBACK_NOT_INDEPENDENT'};
      }

      const execution = await executor.run(executionRequest);
      return {
        ok:execution?.status === 'completed' && execution?.exitCode === 0,
        effect:action.effect,
        evidence:{
          mode:'bounded-process-workspace',
          execution,
          verificationRequest,
          acceptance,
          executionFingerprint:fingerprint(executionRequest),
          verificationFingerprint:fingerprint(verificationRequest)
        }
      };
    },

    async verify(result, action) {
      if (result?.ok !== true) {
        return {ok:false,code:'COMPUTER_EXECUTION_FAILED'};
      }

      const verificationRequest = result?.evidence?.verificationRequest;
      const acceptance = result?.evidence?.acceptance;
      if (!verificationRequest || !acceptance) {
        return {ok:false,code:'COMPUTER_READBACK_CONTRACT_MISSING'};
      }

      const readback = await executor.run(verificationRequest);
      const ok = acceptancePasses(readback,acceptance);
      return {
        ok,
        code:ok ? null : 'COMPUTER_READBACK_FAILED',
        mode:'independent-process-readback',
        executionFingerprint:result?.evidence?.executionFingerprint || null,
        verificationFingerprint:result?.evidence?.verificationFingerprint || null,
        readback
      };
    }
  });
}
