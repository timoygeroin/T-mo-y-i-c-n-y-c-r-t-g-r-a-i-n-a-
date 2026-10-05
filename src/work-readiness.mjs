// Describes this server only. The user's phone is an interface, not an executor.
// A callable read endpoint must never be promoted to general task completion.
export function describeWorkReadiness({env=process.env}={}) {
  const modelEnabled=env.MONDAYID_MODEL_EXECUTION_ENABLED==='true';
  const spendAuthorized=env.MONDAYID_API_SPEND_ENABLED==='true';
  return {
    schema:'mondayid.work-delivery.v1',
    humanInterface:{iphoneFirst:true,userComputerRequired:false,nativeAppRequiredForHostWork:false},
    controlPlane:{available:true,scope:'bounded-operations',generalTaskExecutor:false},
    hostWork:{route:'current-host-tools',availability:'DISCOVER_IN_CURRENT_TURN',
      requiresCustomMcp:false,requiresPaidModelApi:false,
      completionRequires:['requested-effect','independent-readback','durable-receipt']},
    standaloneChat:{
      configured:Boolean(modelEnabled && spendAuthorized && env.OPENAI_API_KEY && env.MONDAYID_HOST_TOKEN && env.MONDAYID_WORLDLINE_URL),
      state:!modelEnabled?'MODEL_EXECUTION_DISABLED':!spendAuthorized?'API_SPEND_NOT_AUTHORIZED':'CONFIGURATION_AND_LIVE_ACCEPTANCE_REQUIRED',
      verified:false
    },
    sharedWrite:{configured:Boolean(env.MONDAYID_WORLDLINE_WRITER_TOKEN),verified:false},
    physicalIphoneAcceptance:'NOT_OBSERVED_BY_SERVER',
    wholeProductComplete:false
  };
}
