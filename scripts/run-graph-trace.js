const baseUrl = (process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const main = async () => {
  const question = process.argv.slice(2).join(' ').trim() || '사출 플래시 burr 원인 대책';
  const response = await fetch(`${baseUrl}/v1/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question,
      top_k: 8,
      session_id: `mold-master-trace-${Date.now()}`,
      filters: {
        include_rag: true,
        include_reasoning_paths: true,
        include_knowledge_graph: true,
        include_knowledge_relations: true,
        evidence_policy: 'graph_approved_only',
        source_app: 'mold-master-ai'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Common Agent graph trace failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  console.log(`Query: ${question}`);
  console.log(`Graph Source: ${baseUrl}/v1/ask`);
  console.log(`Confidence: ${Math.round((payload.confidence || 0) * 1000) / 10}%`);
  console.log(`Approved Evidence: ${evidence.length}`);
  console.log('');
  console.log('Answer:');
  console.log(payload.answer || 'No grounded answer returned.');
  console.log('');
  console.log('Retrieval Trace:');
  for (const item of payload.reasoning_trace || []) {
    if (/graph|evidence|retrieval|policy|source_counts/.test(item)) console.log(`- ${item}`);
  }
  console.log('');
  console.log('Evidence Paths:');
  if (evidence.length === 0) {
    console.log('- no approved path found');
    process.exitCode = 1;
    return;
  }
  evidence.forEach((item, index) => {
    const identity = item.node_id || item.source_ref || `evidence-${index + 1}`;
    const text = String(item.text || item.content || '').replace(/\s+/g, ' ').trim();
    console.log(`${index + 1}. [${item.source_type || 'graph'}] ${identity} (${item.review_status || 'unknown'})`);
    console.log(`   ${text.slice(0, 320)}`);
  });
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
