const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const fixturePath = path.join(root, 'eval', 'graph', 'approved-graph-benchmark.json');
const artifactPath = path.join(root, 'artifacts', 'approved-graph-benchmark-report.json');
const baseUrl = (process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const normalize = value => String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

const runCase = async testCase => {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/v1/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: testCase.question,
        top_k: 8,
        session_id: `mold-master-graph-eval-${testCase.id}`,
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
    const payload = await response.json();
    const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
    const evidenceText = normalize(evidence.map(item => item.text || item.content || '').join('\n'));
    const keywordHits = testCase.expectedEvidenceKeywords.filter(keyword =>
      evidenceText.includes(normalize(keyword))
    );
    const nonApproved = evidence.filter(item => item.review_status !== 'approved');
    const checks = {
      http: response.ok,
      evidenceCount: evidence.length >= (testCase.minEvidenceCount || 1),
      evidenceRelevance: keywordHits.length > 0,
      approvedOnly: evidence.length > 0 && nonApproved.length === 0
    };

    return {
      id: testCase.id,
      passed: Object.values(checks).every(Boolean),
      latencyMs: Date.now() - startedAt,
      confidence: payload.confidence || 0,
      evidenceCount: evidence.length,
      evidenceTypes: [...new Set(evidence.map(item => item.source_type).filter(Boolean))],
      keywordHits,
      expectedEvidenceKeywords: testCase.expectedEvidenceKeywords,
      checks,
      trace: (payload.reasoning_trace || []).filter(item =>
        /evidence_policy=|global_graph_snippets=|context_after_policy=|source_counts=/.test(item)
      ),
      error: response.ok ? undefined : JSON.stringify(payload)
    };
  } catch (error) {
    return {
      id: testCase.id,
      passed: false,
      latencyMs: Date.now() - startedAt,
      confidence: 0,
      evidenceCount: 0,
      evidenceTypes: [],
      keywordHits: [],
      expectedEvidenceKeywords: testCase.expectedEvidenceKeywords,
      checks: {
        http: false,
        evidenceCount: false,
        evidenceRelevance: false,
        approvedOnly: false
      },
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const run = async () => {
  const concurrency = 4;
  const results = [];
  for (let index = 0; index < fixture.cases.length; index += concurrency) {
    const batch = fixture.cases.slice(index, index + concurrency);
    results.push(...await Promise.all(batch.map(runCase)));
  }

  const passed = results.filter(result => result.passed).length;
  const passRate = results.length > 0 ? passed / results.length : 0;
  const latencies = results.map(result => result.latencyMs).sort((a, b) => a - b);
  const percentile = value => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] || 0;
  const report = {
    generatedAt: new Date().toISOString(),
    commonAgentUrl: baseUrl,
    policy: 'graph_approved_only',
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: Math.round(passRate * 1000) / 10,
      minimumPassRate: fixture.minimumPassRate * 100,
      p50LatencyMs: percentile(0.5),
      p95LatencyMs: percentile(0.95),
      readyToRetireLegacyGraphRag: passRate >= fixture.minimumPassRate
    },
    results
  };

  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Approved Graph benchmark: ${passed}/${results.length} (${report.summary.passRate}%)`);
  console.log(`Latency p50=${report.summary.p50LatencyMs}ms p95=${report.summary.p95LatencyMs}ms`);
  for (const result of results.filter(item => !item.passed)) {
    console.log(`FAIL ${result.id}: evidence=${result.evidenceCount}, keywords=${result.keywordHits.join(',') || 'none'}, checks=${JSON.stringify(result.checks)}`);
  }
  console.log(`Report: ${artifactPath}`);

  if (!report.summary.readyToRetireLegacyGraphRag) process.exitCode = 1;
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
