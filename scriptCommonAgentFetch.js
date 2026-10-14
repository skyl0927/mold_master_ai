const {normalizeCommonAgentBaseUrl,fetchWithCommonAgentPolicy}=require('./commonAgentTransport');

function createScriptFetch({agentUrl,qaUrl,transport=fetchWithCommonAgentPolicy}) {
  const agent=new URL(normalizeCommonAgentBaseUrl(agentUrl));
  const qa=qaUrl?new URL(normalizeCommonAgentBaseUrl(qaUrl)):null;
  const matches=(target,base)=>base && target.origin===base.origin && (
    target.pathname===base.pathname.replace(/\/$/,'') || target.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/'));
  return async(url,options={},timeoutMs=180000)=>{
    const target=new URL(url);
    if(matches(target,agent))return transport(url,options,{timeoutMs});
    // A separate legacy QA endpoint never receives the Common Agent credential.
    if(matches(target,qa))return transport(url,options,{timeoutMs,fetchImpl:globalThis.fetch});
    throw Error('Evaluation request does not match a trusted configured server');
  };
}
module.exports={createScriptFetch};
