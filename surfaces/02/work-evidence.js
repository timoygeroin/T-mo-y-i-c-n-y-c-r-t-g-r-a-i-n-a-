/* Monday Work: public read-only release evidence, not an agent scheduler.
   Historical fallback is an explicitly dated snapshot, NOT a live claim. */
(function (root) {
  'use strict';
  const repository = 'timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-';
  const api = 'https://api.github.com/repos/' + repository + '/pulls?state=closed&sort=updated&direction=desc&per_page=16';
  const source = 'https://github.com/' + repository + '/pull/';
  const fallback = Object.freeze([
    {number:180,title:'Monday Work: наблюдаемая лента действий',tag:'Рабочее ядро',mergedAt:'2026-10-22',url:source+'180'},
    {number:179,title:'MondayID Create — собственный генератор',tag:'Опубликованный экран',mergedAt:'2026-10-22',url:source+'179'},
    {number:178,title:'Сборка результата из простых операций',tag:'Substrate Compiler',mergedAt:'2026-10-22',url:source+'178'},
    {number:177,title:'Выбор эффекта раньше поставщика',tag:'Substrate Compiler',mergedAt:'2026-10-22',url:source+'177'},
    {number:175,title:'Независимый контракт выполнения',tag:'Переносимое ядро',mergedAt:'2026-10-22',url:source+'175'},
    {number:174,title:'Локальная библиотека файлов',tag:'Опубликованный экран',mergedAt:'2026-10-22',url:source+'174'}
  ]);
  const validNumber = value => Number.isSafeInteger(value) && value > 0 && value <= 9999999;
  const snapshot = () => Object.freeze({
    source:'snapshot',asOf:'2026-10-22',checkedAt:null,items:fallback.map(item=>({...item}))
  });
  async function retrieve(fetchImpl) {
    if(typeof fetchImpl!=='function')throw new Error('FETCH_UNAVAILABLE');
    const response=await fetchImpl(api,{method:'GET',headers:{Accept:'application/vnd.github+json'}});
    if(!response?.ok)throw new Error('GITHUB_UNAVAILABLE');
    const data=await response.json();
    if(!Array.isArray(data))throw new Error('INVALID_EVIDENCE');
    const items=data.filter(item=>item&&item.merged_at&&validNumber(item.number)&&typeof item.title==='string')
      .slice(0,8)
      .map(item=>({
        number:item.number,
        title:item.title.trim().slice(0,140),
        tag:'Слито в GitHub',
        mergedAt:item.merged_at,
        url:source+item.number
      }));
    if(!items.length)throw new Error('NO_MERGED_PRS');
    return Object.freeze({source:'github',asOf:null,checkedAt:new Date().toISOString(),items});
  }
  // Actual scheduled GitHub Actions runs. A workflow run is infrastructure proof,
  // not proof that an AI autonomously wrote or merged code.
  const cycleApi='https://api.github.com/repos/'+repository+
    '/actions/workflows/monday-work-cycle.yml/runs?per_page=6';
  const runBase='https://github.com/'+repository+'/actions/runs/';
  async function retrieveCycles(fetchImpl){
    if(typeof fetchImpl!=='function')throw Error('WORK_CYCLES_UNAVAILABLE');
    const response=await fetchImpl(cycleApi,{method:'GET',headers:{Accept:'application/vnd.github+json'}});
    if(!response?.ok)throw Error('WORK_CYCLES_UNAVAILABLE');
    const data=await response.json();
    if(!Array.isArray(data?.workflow_runs))throw Error('WORK_CYCLES_INVALID');
    const runs=data.workflow_runs.filter(r=>r&&Number.isSafeInteger(r.id)&&r.id>0).slice(0,6)
      .map(r=>({id:r.id,url:runBase+r.id,
        state:r.status==='queued'?'QUEUED':r.status==='in_progress'?'RUNNING':
          r.status==='completed'?(r.conclusion==='success'?'SUCCESS':'FAILURE'):'UNKNOWN',
        createdAt:typeof r.created_at==='string'&&Number.isFinite(Date.parse(r.created_at))?r.created_at:null,
      }));
    return Object.freeze({source:'github-actions',checkedAt:new Date().toISOString(),
      state:runs.length?'OBSERVED':'NO_RECORDED_RUNS',runs});
  }
  root.MondayWorkEvidence=Object.freeze({repository,snapshot,retrieve,retrieveCycles});
})(window);
