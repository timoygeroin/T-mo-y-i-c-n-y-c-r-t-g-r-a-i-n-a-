import { simulateDeus0 } from './deus-zero.mjs';

const report = simulateDeus0({
  id:'mondayid-continuity-problem',
  initial:{continuity:0,evidence:0,time:4,budget:0},
  goals:{continuity:{min:2},evidence:{min:2}},
  constraints:{time:{min:0},budget:{max:3}},
  horizon:4,
  actions:[
    {id:'inspect_provenance',source:'existing-worldline',delta:{evidence:1,time:-1,budget:1},risk:0.01},
    {id:'test_transfer',delta:{continuity:1,evidence:1,time:-1,budget:1},requires:{evidence:{min:1}},risk:0.08},
    {id:'verify_on_new_host',delta:{continuity:1,time:-1,budget:1},requires:{evidence:{min:2}},risk:0.02},
    {id:'blind_migration',delta:{continuity:3,time:-5},risk:0.8}
  ]
});
console.log(JSON.stringify(report,null,2));
