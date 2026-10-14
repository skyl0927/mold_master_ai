// Headless native crypto + real child IPC; never opens or controls a desktop UI.
const {app,safeStorage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {fork}=require('node:child_process');
const assert=require('node:assert/strict');
const {createCredentialVault,createSecureGateway}=require('../commonAgentSecureGateway');
const {attachChildBroker}=require('../commonAgentChildTransport');

if(process.env.MOLD_MASTER_AUTH_WIRE_CHILD==='1') {
  const {fetchWithCommonAgentPolicy}=require('../commonAgentTransport');
  globalThis.fetch=async()=>{throw Error('Anonymous child fetch forbidden');};
  let step='status';
  (async()=>{
    const base=process.env.COMMON_AGENT_URL;
    const status=await fetchWithCommonAgentPolicy(base+'/v1/vision/status');
    const identity=await status.json();
    assert.equal(status.status,200);assert.equal(identity.kind,'service');
    step='image';
    const image=await fetchWithCommonAgentPolicy(base+'/v1/datasets/images/test-only/file');
    const bytes=new Uint8Array(await image.arrayBuffer());
    assert.equal(image.status,200);assert.deepEqual(Array.from(bytes.slice(0,8)),[137,80,78,71,13,10,26,10]);
    step='no-write-multiview';
    const form=new FormData();form.append('persist_mode','never');
    for(let i=0;i<4;i++)form.append('view_files',new Blob([bytes],{type:'image/png'}),'test-only-'+i+'.png');
    const diagnosis=await fetchWithCommonAgentPolicy(base+'/v1/vision/diagnose',{method:'POST',body:form});
    if(diagnosis.status!==200)throw Error('Private diagnosis HTTP '+diagnosis.status);
    const result=await diagnosis.json();
    assert.equal(result.metadata.persisted_to_dataset,false);
    assert.equal(result.metadata.service_writes_performed,false);
    assert.equal(result.view_count,4);
    form.set('persist_mode','always');
    await assert.rejects(fetchWithCommonAgentPolicy(base+'/v1/vision/diagnose',{method:'POST',body:form}),/scope|no.write/i);
    form.set('persist_mode','never');form.append('persist_mode','always');
    await assert.rejects(fetchWithCommonAgentPolicy(base+'/v1/vision/diagnose',{method:'POST',body:form}),/multipart/i);
    form.set('persist_mode','never');form.set('workspace_id','foreign-workspace');
    await assert.rejects(fetchWithCommonAgentPolicy(base+'/v1/vision/diagnose',{method:'POST',body:form}),/identity/i);
    await assert.rejects(fetchWithCommonAgentPolicy(base+'/v1/feedback',{method:'POST',body:'{}'}),/human|scope/i);
    console.log(JSON.stringify({test_only:true,status:'passed',kind:identity.kind,views:4,anonymous_requests:0}));
  })().catch(error=>{console.error(JSON.stringify({status:'failed',step,error_type:error.name,detail:error.message.slice(0,300)}));process.exitCode=1;});
} else {
  let stage='input';
  const root=process.env.MOLD_MASTER_AUTH_PROBE_ROOT;
  if(!root || !path.isAbsolute(root) || path.basename(root)!=='native-key-wire')throw Error('Explicit owned native profile required');
  fs.mkdirSync(root,{recursive:true});app.setPath('userData',root);
  const configPath=path.join(root,'test-only-issued-config.json');
  let input;
  try {
    assert(fs.statSync(configPath).size<=20000);
    input=Promise.resolve(JSON.parse(fs.readFileSync(configPath,'utf8')));
  } catch {input=Promise.reject(Error('Invalid owned wire configuration'));}
  finally {if(fs.existsSync(configPath))fs.unlinkSync(configPath);}
  Promise.all([app.whenReady(),input]).then(async([,config])=>{
    stage='protected-install';
    const base=new URL(config.base_url);
    assert.equal(base.hostname,'127.0.0.1');assert(!['8000','3400','5432'].includes(base.port));
    const filePath=path.join(root,'test-only-credential.enc');
    const vault=createCredentialVault({filePath,safeStorage});
    const gateway=createSecureGateway({vault});
    const diagnosticGateway={async fetch(...args) {
      try {return await gateway.fetch(...args);}
      catch(error) {
        const detail=String(error.stack || error.message);
        assert(!detail.includes(config.grant.token));
        console.error(JSON.stringify({test_only:true,stage:'parent-wire',detail:detail.slice(0,1800)}));
        throw error;
      }
    }};
    let child;
    try {
      const status=vault.install({...config.grant,base_url:config.base_url});
      assert.equal(status.configured,true);
      assert(!fs.readFileSync(filePath).includes(Buffer.from(config.grant.token)));
      assert(!JSON.stringify(status).includes(config.grant.token));
      stage='native-child';
      const childEnv={...process.env,ELECTRON_RUN_AS_NODE:'1',MOLD_MASTER_AUTH_WIRE_CHILD:'1',
        MOLD_MASTER_COMMON_AGENT_BROKER:'1',COMMON_AGENT_URL:config.base_url};
      assert(!JSON.stringify(childEnv).includes(config.grant.token));
      child=fork(__filename,[],{execPath:process.execPath,silent:true,serialization:'advanced',windowsHide:true,env:childEnv});
      assert(!child.spawnargs.some(argument=>argument.includes(config.grant.token)));
      attachChildBroker({child,getBaseUrl:()=>config.base_url,gateway:diagnosticGateway});
      let output='',childError='';child.stdout.on('data',part=>{output+=part.toString();});
      child.stderr.on('data',part=>{childError+=part.toString();});
      const code=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{child.kill();reject(Error('Owned child timeout'));},20000);
        child.on('error',error=>{clearTimeout(timer);reject(error);});
        child.on('close',code=>{clearTimeout(timer);resolve(code);});
      });
      if(code!==0) {
        assert(!childError.includes(config.grant.token));
        console.error(childError.slice(0,1000));
      }
      assert.equal(code,0);
      assert(!output.includes(config.grant.token));
      assert.equal(JSON.parse(output.trim()).status,'passed');
      console.log(JSON.stringify({test_only:true,status:'passed',native_protected_storage:true,
        server_issued_key:true,actual_child_binary_ipc:true,view_count:4,
        raw_key_in_child_environment_or_arguments:false,credential_returned:false,
        scope_and_conflicting_claims_rejected:true,human_mutation_rejected:true,
        runtime_node_version:process.versions.node,runtime_electron_version:process.versions.electron,
        browser_or_operating_dataset_used:false,paid_models:0}));
    } finally {
      if(child && child.exitCode===null)child.kill();
      if(fs.existsSync(filePath))fs.unlinkSync(filePath);
    }
    app.exit(0);
  }).catch(error=>{console.error(JSON.stringify({status:'failed',stage,error_type:error.name}));app.exit(1);});
}
