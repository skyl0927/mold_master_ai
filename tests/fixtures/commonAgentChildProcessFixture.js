const {fetchWithCommonAgentPolicy}=require('../../commonAgentTransport');
globalThis.fetch=async()=>{throw Error('Anonymous fixture fetch forbidden');};
fetchWithCommonAgentPolicy(process.argv[2]+'/v1/datasets/images/test-only/file').then(async response=>{
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(response.status!==200 || bytes.join(',')!=='1,2,3')throw Error('Invalid protected child response');
  console.log(JSON.stringify({test_only:true,status:'passed',anonymous_requests:0}));
}).catch(()=>{process.exitCode=1;});
