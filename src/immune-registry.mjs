const asNumber=value=>Number.isFinite(Number(value)) ? Number(value) : 0;
const unique=values=>[...new Set((values || []).filter(Boolean).map(String))];

const textOf=value=>String(
  value?.text ??
  value?.message ??
  value?.output ??
  value?.candidate?.text ??
  value?.candidate?.message ??
  value?.candidate?.output ??
  ''
);

const evidencePresent=observation=>Boolean(
  observation?.evidence ||
  observation?.receipt ||
  observation?.readback ||
  observation?.verified === true ||
  observation?.verification?.ok === true
);

export const BUILTIN_IMMUNE_DETECTORS=Object.freeze({
  COMPLETION_WITHOUT_EVIDENCE(observation={}){
    const text=textOf(observation);
    const claims=/(?:\b(?:done|completed|finished|verified)\b|\b(?:готово|сделано|завершено|проверено)\b)/iu.test(text);
    return claims && !evidencePresent(observation)
      ? {hit:true,code:'COMPLETION_WITHOUT_EVIDENCE'}
      : {hit:false};
  },

  MEMORY_CLAIM_WITHOUT_PROVENANCE(observation={}){
    const memoryClaim=
      observation.memoryClaim === true ||
      observation.claimType === 'memory' ||
      observation.claimType === 'reconstruction';
    const provenance=unique([
      ...(observation.provenance || []),
      observation.sourceRef,
      observation.fileRef,
      observation.worldlineRef
    ]);
    return memoryClaim && provenance.length === 0
      ? {hit:true,code:'MEMORY_CLAIM_WITHOUT_PROVENANCE'}
      : {hit:false};
  },

  ARTIFACT_WITHOUT_EFFECT(observation={}){
    const artifactDelivered=
      observation.artifactDelivered === true ||
      observation.resultKind === 'artifact' ||
      Boolean(observation.artifact);
    const artifactIsTarget=observation.artifactIsTarget === true;
    const effectVerified=
      observation.desiredEffectVerified === true ||
      observation.verification?.ok === true;
    return artifactDelivered && !artifactIsTarget && !effectVerified
      ? {hit:true,code:'ARTIFACT_WITHOUT_EFFECT'}
      : {hit:false};
  },

  THEORY_WITHOUT_SEMANTIC_PROGRESS(observation={}){
    const explanationOnly=observation.explanationOnly === true;
    const cycles=asNumber(observation.cycles);
    const progress=observation.semanticProgress === true;
    const stable=observation.stableBlocker === true;
    return explanationOnly && cycles >= 2 && !progress && !stable
      ? {hit:true,code:'THEORY_WITHOUT_SEMANTIC_PROGRESS'}
      : {hit:false};
  },

  SURFACE_RELEASE_WITH_ACTIVE_INTENT(observation={}){
    const released=observation.surfaceReleased === true;
    const active=asNumber(observation.activeIntents);
    return released && active > 0
      ? {hit:true,code:'SURFACE_RELEASE_WITH_ACTIVE_INTENT'}
      : {hit:false};
  },

  ARCHIVE_CLAIM_WITHOUT_SOURCE_READBACK(observation={}){
    const claims=observation.archiveClaim === true || observation.claimType === 'archive';
    const readback=
      observation.sourceReadback === true ||
      observation.fileReadback === true ||
      observation.provenanceVerified === true;
    return claims && !readback
      ? {hit:true,code:'ARCHIVE_CLAIM_WITHOUT_SOURCE_READBACK'}
      : {hit:false};
  },

  EPISTEMIC_UPGRADE_WITHOUT_EVIDENCE(observation={}){
    const source=String(observation.sourceStance || 'unspecified');
    const output=String(observation.outputStance || 'unspecified');
    const weak=new Set(['belief','hypothesis','metaphor','claimed-knowledge','unknown','unspecified']);
    const strong=new Set(['fact','verified','known','observation']);
    return weak.has(source) && strong.has(output) && !evidencePresent(observation)
      ? {hit:true,code:'EPISTEMIC_UPGRADE_WITHOUT_EVIDENCE'}
      : {hit:false};
  },

  SOURCE_COVERAGE_GAP(observation={}){
    const required=new Set(unique(observation.requiredSources));
    const covered=new Set(unique(observation.coveredSources));
    const missing=[...required].filter(item=>!covered.has(item));
    return missing.length
      ? {hit:true,code:'SOURCE_COVERAGE_GAP',missing}
      : {hit:false};
  }
});

export class ImmuneRegistry {
  constructor({genes=[]}={}){
    this.genes=new Map();
    for(const gene of genes) this.register(gene);
  }

  register(gene={}){
    if(!gene.id) return {ok:false,code:'FAILURE_GENE_ID_REQUIRED'};
    if(!['PROVEN','PARTIAL','UNRESOLVED'].includes(gene.status)){
      return {ok:false,code:'FAILURE_GENE_STATUS_INVALID',id:gene.id};
    }

    const normalized={
      id:String(gene.id),
      status:gene.status,
      detector:gene.detector || {kind:'none',id:null},
      mechanisms:unique(gene.mechanisms),
      regressions:unique(gene.regressions),
      gap:gene.gap || null,
      archiveReady:gene.archiveReady === true
    };

    if(normalized.archiveReady && normalized.status !== 'PROVEN'){
      return {ok:false,code:'ARCHIVE_READY_REQUIRES_PROVEN',id:normalized.id};
    }
    if(normalized.archiveReady && normalized.regressions.length === 0){
      return {ok:false,code:'ARCHIVE_READY_REQUIRES_REGRESSION',id:normalized.id};
    }
    if(normalized.archiveReady && normalized.mechanisms.length === 0){
      return {ok:false,code:'ARCHIVE_READY_REQUIRES_MECHANISM',id:normalized.id};
    }
    if(normalized.detector.kind === 'builtin' && !BUILTIN_IMMUNE_DETECTORS[normalized.detector.id]){
      return {ok:false,code:'UNKNOWN_BUILTIN_DETECTOR',id:normalized.id,detector:normalized.detector.id};
    }

    this.genes.set(normalized.id,normalized);
    return {ok:true,gene:structuredClone(normalized)};
  }

  get(id){
    const gene=this.genes.get(id);
    return gene ? structuredClone(gene) : null;
  }

  evaluate(geneId,observation={}){
    const gene=this.genes.get(geneId);
    if(!gene) return {ok:false,code:'UNKNOWN_FAILURE_GENE',geneId};
    if(gene.detector.kind !== 'builtin'){
      return {
        ok:true,
        geneId,
        evaluable:false,
        structural:gene.detector.kind === 'structural',
        detector:gene.detector.id || null,
        status:gene.status
      };
    }

    const detector=BUILTIN_IMMUNE_DETECTORS[gene.detector.id];
    const result=detector(observation);
    return {
      ok:true,
      geneId,
      evaluable:true,
      detector:gene.detector.id,
      status:gene.status,
      ...result
    };
  }

  coverage(geneId){
    const gene=this.genes.get(geneId);
    if(!gene) return {ok:false,code:'UNKNOWN_FAILURE_GENE',geneId};
    const detectorExists =
      gene.detector.kind === 'structural' ||
      (gene.detector.kind === 'builtin' && Boolean(BUILTIN_IMMUNE_DETECTORS[gene.detector.id]));
    const regressionExists=gene.regressions.length>0;
    const mechanismExists=gene.mechanisms.length>0;
    const archiveReady=
      gene.status === 'PROVEN' &&
      gene.archiveReady === true &&
      detectorExists &&
      regressionExists &&
      mechanismExists;
    return {
      ok:true,
      geneId,
      status:gene.status,
      detectorExists,
      regressionExists,
      mechanismExists,
      archiveReady,
      gap:gene.gap
    };
  }

  snapshot(){
    return [...this.genes.values()].map(item=>structuredClone(item));
  }
}

export function evaluateSemanticGarbageCollection(rule={},registry){
  if(!registry) return {ok:false,code:'IMMUNE_REGISTRY_REQUIRED'};
  if(!rule.id) return {ok:false,code:'RULE_ID_REQUIRED'};

  const requiredGenes=unique(rule.requiredGenes);
  if(requiredGenes.length===0){
    return {
      ok:true,
      ruleId:rule.id,
      disposition:'KEEP_ACTIVE',
      reason:'NO_FAILURE_GENE_COVERAGE_DECLARED',
      blockers:['NO_FAILURE_GENE_COVERAGE_DECLARED']
    };
  }

  const coverage=requiredGenes.map(id=>registry.coverage(id));
  const unknown=coverage.filter(item=>item.ok===false);
  const blocked=coverage.filter(item=>item.ok===true && item.archiveReady!==true);

  if(unknown.length || blocked.length){
    return {
      ok:true,
      ruleId:rule.id,
      disposition:'KEEP_ACTIVE',
      reason:'REGRESSION_COVERAGE_INCOMPLETE',
      blockers:[
        ...unknown.map(item=>item.geneId),
        ...blocked.map(item=>item.geneId)
      ],
      coverage
    };
  }

  const replacements=unique(rule.replacementMechanisms);
  if(replacements.length===0){
    return {
      ok:true,
      ruleId:rule.id,
      disposition:'KEEP_ACTIVE',
      reason:'REPLACEMENT_MECHANISM_NOT_DECLARED',
      blockers:['REPLACEMENT_MECHANISM_NOT_DECLARED'],
      coverage
    };
  }

  return {
    ok:true,
    ruleId:rule.id,
    disposition:'ARCHIVE_AS_PROVENANCE',
    reason:'FUNCTION_SUBSUMED_BY_VERIFIED_MECHANISMS',
    replacementMechanisms:replacements,
    coverage
  };
}

export function planSemanticGarbageCollection(rules=[],registry){
  const decisions=rules.map(rule=>evaluateSemanticGarbageCollection(rule,registry));
  return {
    ok:decisions.every(item=>item.ok),
    archive:decisions.filter(item=>item.disposition==='ARCHIVE_AS_PROVENANCE'),
    keep:decisions.filter(item=>item.disposition!=='ARCHIVE_AS_PROVENANCE'),
    decisions
  };
}
