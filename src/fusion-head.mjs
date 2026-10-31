import crypto from 'node:crypto';

const SOURCE_RANK=Object.freeze({
  current_signal:0,
  current_verified_state:1,
  verified_external_readback:2,
  direct_historical_source:3,
  historical_chat:4,
  archive_derived:5,
  memory:6,
  model_summary:7,
  unknown:8
});

const norm=v=>String(v??'').trim();
const uniq=xs=>[...new Set((xs||[]).filter(Boolean).map(norm))];
const ts=v=>{
  const n=Date.parse(v||'');
  return Number.isFinite(n)?n:0;
};
const stable=value=>Array.isArray(value)
  ? '['+value.map(stable).join(',')+']'
  : value&&typeof value==='object'
    ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'
    : JSON.stringify(value);

function rankOf(c){
  if(c.directCurrent) return 0;
  if(c.sourceType in SOURCE_RANK) return SOURCE_RANK[c.sourceType];
  if(c.verified) return 4;
  return 8;
}

function normalizedContribution(input={}){
  const id=norm(input.id||input.contributionId);
  const kind=norm(input.kind||'law').toLowerCase();
  const key=norm(input.key||input.locus);
  const value=norm(input.value);
  const sourceRef=norm(input.sourceRef||input.source_ref);
  if(!id||!key||!value||!sourceRef) return null;
  return Object.freeze({
    id,kind,key,value,sourceRef,
    sourceType:norm(input.sourceType||input.source_type||'unknown'),
    verified:input.verified===true,
    failed:input.failed===true,
    superseded:input.superseded===true,
    directCurrent:input.directCurrent===true,
    timestamp:norm(input.timestamp),
    evidenceRefs:Object.freeze(uniq(input.evidenceRefs||input.evidence_refs)),
    metadata:input.metadata||null
  });
}

function consolidateSameValue(items){
  const base=[...items].sort((a,b)=>rankOf(a)-rankOf(b)||ts(b.timestamp)-ts(a.timestamp)||a.id.localeCompare(b.id))[0];
  return Object.freeze({
    ...base,
    ids:Object.freeze(items.map(x=>x.id).sort()),
    sourceRefs:Object.freeze(uniq(items.map(x=>x.sourceRef)).sort()),
    evidenceRefs:Object.freeze(uniq(items.flatMap(x=>x.evidenceRefs||[])).sort()),
    directCurrent:items.some(x=>x.directCurrent),
    verified:items.some(x=>x.verified),
    timestamp:items.map(x=>x.timestamp).sort((a,b)=>ts(b)-ts(a))[0]||base.timestamp,
    rank:Math.min(...items.map(rankOf))
  });
}

export function compileFusionHead({
  currentSignal={},
  contributions=[],
  inventory={}
}={}){
  const active=[];
  const ancestry=[];
  const openConflicts=[];
  const candidates=(Array.isArray(contributions)?contributions:[])
    .map(normalizedContribution)
    .filter(Boolean);

  const eligible=[];
  for(const c of candidates){
    if(c.kind==='identity' && !c.directCurrent){
      ancestry.push(Object.freeze({...c,reason:'HISTORICAL_IDENTITY_IS_ANCESTRY_ONLY'}));
      continue;
    }
    if(c.failed){
      ancestry.push(Object.freeze({...c,reason:'FAILED_MUTATION'}));
      continue;
    }
    if(c.superseded){
      ancestry.push(Object.freeze({...c,reason:'SUPERSEDED_MUTATION'}));
      continue;
    }
    if(!c.verified && !c.directCurrent){
      ancestry.push(Object.freeze({...c,reason:'UNVERIFIED_CANDIDATE'}));
      continue;
    }
    eligible.push(c);
  }

  const groups=new Map();
  for(const c of eligible){
    const gk=c.kind+':'+c.key;
    if(!groups.has(gk)) groups.set(gk,[]);
    groups.get(gk).push(c);
  }

  for(const [gk,items] of groups){
    const byValue=new Map();
    for(const c of items){
      if(!byValue.has(c.value)) byValue.set(c.value,[]);
      byValue.get(c.value).push(c);
    }
    const variants=[...byValue.values()].map(consolidateSameValue)
      .sort((a,b)=>a.rank-b.rank||ts(b.timestamp)-ts(a.timestamp)||a.value.localeCompare(b.value));

    if(variants.length===1){
      active.push(variants[0]);
      continue;
    }

    const bestRank=variants[0].rank;
    const sameRank=variants.filter(v=>v.rank===bestRank);
    const newestTs=Math.max(...sameRank.map(v=>ts(v.timestamp)));
    const top=sameRank.filter(v=>ts(v.timestamp)===newestTs);

    if(top.length>1){
      openConflicts.push(Object.freeze({
        key:gk,
        kind:items[0].kind,
        locus:items[0].key,
        state:'OPEN_CONFLICT',
        variants:Object.freeze(top)
      }));
      for(const v of variants){
        ancestry.push(Object.freeze({...v,reason:'OPEN_CONFLICT_NO_ACTIVE_ALLELE'}));
      }
      continue;
    }

    const winner=top[0];
    active.push(winner);
    for(const loser of variants){
      if(loser.value===winner.value) continue;
      ancestry.push(Object.freeze({
        ...loser,
        reason:'LOWER_AUTHORITY_OR_OLDER_THAN_ACTIVE',
        winnerValue:winner.value,
        winnerSourceRefs:winner.sourceRefs
      }));
    }
  }

  active.sort((a,b)=>(a.kind+':'+a.key).localeCompare(b.kind+':'+b.key));
  ancestry.sort((a,b)=>(a.kind+':'+a.key+':'+a.value).localeCompare(b.kind+':'+b.key+':'+b.value));
  openConflicts.sort((a,b)=>a.key.localeCompare(b.key));

  const structuralChats=Number.isFinite(Number(inventory.structuralChats))?Number(inventory.structuralChats):null;
  const semanticRelivedChats=Number.isFinite(Number(inventory.semanticRelivedChats))?Number(inventory.semanticRelivedChats):null;
  const gitBranches=Number.isFinite(Number(inventory.gitBranches))?Number(inventory.gitBranches):null;
  const semanticComplete=structuralChats!==null && semanticRelivedChats!==null && structuralChats>0 && semanticRelivedChats>=structuralChats;

  const payload={
    schema:'mondayid.fusion-head.v1',
    outwardIdentity:'ONE_MONDAY',
    parallelIdentities:0,
    currentSignal:Object.freeze({
      id:norm(currentSignal.id),
      text:norm(currentSignal.text)
    }),
    active:Object.freeze(active),
    ancestry:Object.freeze(ancestry),
    openConflicts:Object.freeze(openConflicts),
    coverage:Object.freeze({
      gitBranches,
      structuralChats,
      semanticRelivedChats,
      semanticComplete,
      law:'coverage_is_not_authority;unread_or_unadjudicated_sources_remain_unknown'
    }),
    laws:Object.freeze([
      'many_sources_one_experienced_self',
      'current_direct_signal_outranks_historical_prediction',
      'failed_or_superseded_mutations_remain_ancestry_not_authority',
      'semantic_duplicates_merge_provenance_not_identity',
      'equal_unresolved_conflicts_remain_open_without_split_persona',
      'historical_whole_identity_claims_cannot_create_parallel_monday',
      'unknown_coverage_never_fabricates_completion'
    ])
  };
  return Object.freeze({
    ...payload,
    fingerprint:crypto.createHash('sha256').update(stable(payload)).digest('hex')
  });
}
