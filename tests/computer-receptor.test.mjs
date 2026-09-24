import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProcessWorkspaceExecutor } from '../src/execution/process-workspace-executor.mjs';
import { createProcessComputerReceptor } from '../src/execution/computer-receptor.mjs';
import { MondayRuntime } from '../src/runtime.mjs';

test('computer receptor requires a distinct readback before it can satisfy an effect', async () => {
  const root=await mkdtemp(join(tmpdir(),'mondayid-computer-'));
  try {
    const executor=createProcessWorkspaceExecutor({root,allowedCommands:['python3']});
    const receptor=createProcessComputerReceptor({executor});
    const routeCandidate={
      domain:'code',
      effect:'persist verified artifact',
      executionRequest:{
        command:'python3',
        args:['-c',"from pathlib import Path; Path('proof.txt').write_text('verified-computer', encoding='utf-8')"]
      },
      verificationRequest:{
        command:'python3',
        args:['-c',"from pathlib import Path; print(Path('proof.txt').read_text(encoding='utf-8'), end='')"]
      },
      acceptance:{stdoutEquals:'verified-computer',stderrEmpty:true}
    };
    const action={domain:'code',effect:'persist verified artifact',routeCandidate};

    assert.equal(receptor.supports(action),true);
    const result=await receptor.execute(action);
    assert.equal(result.ok,true);
    const verification=await receptor.verify(result,action);
    assert.equal(verification.ok,true);
    assert.notEqual(verification.executionFingerprint,verification.verificationFingerprint);
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});

test('computer receptor blocks execution-only routes with no independent verification plan', async () => {
  const root=await mkdtemp(join(tmpdir(),'mondayid-computer-'));
  try {
    const executor=createProcessWorkspaceExecutor({root,allowedCommands:['python3']});
    const receptor=createProcessComputerReceptor({executor});
    const action={
      domain:'code',
      effect:'unverified write',
      routeCandidate:{
        domain:'code',
        executionRequest:{command:'python3',args:['-c',"print('write')"]},
        acceptance:{stdoutEquals:'write\n'}
      }
    };
    assert.equal(receptor.supports(action),false);
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});

test('Generation-5 runtime can execute and independently read back through the computer receptor', async () => {
  const root=await mkdtemp(join(tmpdir(),'mondayid-computer-'));
  try {
    const executor=createProcessWorkspaceExecutor({root,allowedCommands:['python3']});
    const receptor=createProcessComputerReceptor({executor});
    const runtime=new MondayRuntime({capabilities:{code:receptor}});
    const routeCandidate={
      domain:'code',
      effect:'create computer proof',
      executionRequest:{
        command:'python3',
        args:['-c',"from pathlib import Path; Path('runtime-proof.txt').write_text('runtime-ok', encoding='utf-8')"]
      },
      verificationRequest:{
        command:'python3',
        args:['-c',"from pathlib import Path; print(Path('runtime-proof.txt').read_text(encoding='utf-8'), end='')"]
      },
      acceptance:{stdoutEquals:'runtime-ok',stderrEmpty:true}
    };

    const out=await runtime.cycle([{
      id:'computer-e2e',
      text:'github code computer',
      domains:['code'],
      effect:'create computer proof',
      routeCandidates:[routeCandidate]
    }]);

    assert.equal(out.ok,true);
    assert.equal(out.results.length,1);
    assert.equal(out.results[0].ok,true);
    assert.equal(out.results[0].verification.mode,'independent-process-readback');
    assert.equal(out.intents['computer-e2e'].status,'fulfilled');
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});
