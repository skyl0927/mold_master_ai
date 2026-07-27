const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionReferenceBenchmarkRequest,
  buildVisionReferenceOperationalReport,
  runVisionReferenceOperationalGate
} = require('../visionReferenceOperationalGate');

test('benchmark request uses the current reference store model lineage and release gates', () => {
  const request = buildVisionReferenceBenchmarkRequest({
    currentStatus: {
      embedding_model_version: 'dinov2:facebook/dinov2-base'
    }
  });

  assert.deepEqual(request, {
    embedding_model_version: 'dinov2:facebook/dinov2-base',
    minimum_reference_support: 3,
    minimum_samples: 20,
    required_defect_types: [
      'whitening',
      'short_shot',
      'burn',
      'flash',
      'sink',
      'weld_line',
      'ejection'
    ],
    minimum_samples_per_class: 2,
    minimum_top1_accuracy: 0.8,
    minimum_top3_accuracy: 0.9
  });
});

test('operational report passes only when store and benchmark gates are ready', () => {
  const report = buildVisionReferenceOperationalReport({
    generatedAt: '2026-07-27T01:00:00.000Z',
    agentUrl: 'http://agent.test',
    refreshAttempted: true,
    beforeStatus: { ready: false, status: 'missing', reference_count: 0 },
    refreshResult: {
      status: 'promoted',
      manifest_id: 'dinov2-base-ready',
      reference_count: 42,
      embedding_model_version: 'dinov2:facebook/dinov2-base',
      warnings: []
    },
    afterStatus: {
      ready: true,
      status: 'ready',
      reference_count: 42,
      embedding_model_version: 'dinov2:facebook/dinov2-base',
      embedding_provider: 'dinov2',
      embedding_model_name: 'facebook/dinov2-base',
      embedding_dimensions: 768,
      embedding_device: 'cpu',
      embedding_runtime: 'transformers',
      embedding_production_ready: true
    },
    benchmarkRequest: {
      embedding_model_version: 'dinov2:facebook/dinov2-base',
      minimum_samples: 20
    },
    benchmarkReport: {
      ready_for_graph_retrieval: true,
      failed_gate_checks: [],
      evaluated_count: 42,
      top1_accuracy: 0.91,
      top3_accuracy: 0.97
    }
  });

  assert.equal(report.status, 'passed');
  assert.equal(report.readyForGraphRetrieval, true);
  assert.equal(report.referenceStore.ready, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.serviceWritesPerformed, true);
});

test('operational report blocks missing current store without claiming benchmark completion', () => {
  const report = buildVisionReferenceOperationalReport({
    generatedAt: '2026-07-27T01:00:00.000Z',
    agentUrl: 'http://agent.test',
    refreshAttempted: false,
    beforeStatus: {
      ready: false,
      status: 'missing',
      reference_count: 0,
      message: 'current reference manifest pointer not found'
    },
    afterStatus: {
      ready: false,
      status: 'missing',
      reference_count: 0,
      message: 'current reference manifest pointer not found'
    }
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyForGraphRetrieval, false);
  assert.equal(report.benchmarkExecuted, false);
  assert.deepEqual(report.blockers, [{
    code: 'reference_store_missing',
    detail: 'current reference manifest pointer not found'
  }]);
});

test('operational report blocks prototype embedding stores even with passing accuracy', () => {
  const report = buildVisionReferenceOperationalReport({
    generatedAt: '2026-07-27T01:00:00.000Z',
    agentUrl: 'http://agent.test',
    refreshAttempted: false,
    afterStatus: {
      ready: true,
      status: 'ready',
      reference_count: 20,
      embedding_model_version: 'deterministic-hash-v1:64',
      embedding_provider: 'deterministic-hash',
      embedding_production_ready: false
    },
    benchmarkReport: {
      ready_for_graph_retrieval: true,
      failed_gate_checks: [],
      evaluated_count: 20,
      top1_accuracy: 1,
      top3_accuracy: 1
    }
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyForGraphRetrieval, false);
  assert.deepEqual(report.blockers, [{
    code: 'prototype_embedding_model',
    modelVersion: 'deterministic-hash-v1:64'
  }]);
});

test('runner refreshes, rechecks current store, then benchmarks the promoted model', async () => {
  const calls = [];
  const result = await runVisionReferenceOperationalGate({
    agentUrl: 'http://agent.test',
    refresh: true,
    generatedAt: '2026-07-27T01:00:00.000Z',
    fetchJson: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });
      if (url.endsWith('/references/current') && calls.length === 1) {
        return { ready: false, status: 'missing', reference_count: 0 };
      }
      if (url.endsWith('/references/refresh')) {
        return {
          status: 'promoted',
          manifest_id: 'dinov2-base-ready',
          reference_count: 42,
          embedding_model_version: 'dinov2:facebook/dinov2-base',
          warnings: []
        };
      }
      if (url.endsWith('/references/current')) {
        return {
          ready: true,
          status: 'ready',
          reference_count: 42,
          embedding_model_version: 'dinov2:facebook/dinov2-base',
          embedding_production_ready: true
        };
      }
      if (url.endsWith('/benchmark-current')) {
        return {
          ready_for_graph_retrieval: true,
          failed_gate_checks: [],
          evaluated_count: 42,
          top1_accuracy: 0.9,
          top3_accuracy: 0.95
        };
      }
      throw new Error(`unexpected URL ${url}`);
    }
  });

  assert.deepEqual(calls.map(call => [call.method, call.url]), [
    ['GET', 'http://agent.test/v1/vision/classifier/references/current'],
    ['POST', 'http://agent.test/v1/vision/classifier/references/refresh'],
    ['GET', 'http://agent.test/v1/vision/classifier/references/current'],
    ['POST', 'http://agent.test/v1/vision/classifier/benchmark-current']
  ]);
  assert.equal(
    JSON.parse(calls[3].body).embedding_model_version,
    'dinov2:facebook/dinov2-base'
  );
  assert.equal(result.status, 'passed');
  assert.equal(result.readyForGraphRetrieval, true);
});

test('runner includes the failing endpoint when the current store cannot be reached', async () => {
  const result = await runVisionReferenceOperationalGate({
    agentUrl: 'http://agent.test',
    refresh: false,
    generatedAt: '2026-07-27T01:00:00.000Z',
    fetchJson: async () => {
      throw new Error('network down');
    }
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.blockers[0].code, 'reference_store_invalid');
  assert.match(
    result.blockers[0].detail,
    /http:\/\/agent\.test\/v1\/vision\/classifier\/references\/current/
  );
  assert.match(result.blockers[0].detail, /network down/);
});

test('runner classifies 404 reference endpoints as missing API support', async () => {
  const result = await runVisionReferenceOperationalGate({
    agentUrl: 'http://agent.test',
    refresh: true,
    generatedAt: '2026-07-27T01:00:00.000Z',
    fetchJson: async url => {
      throw new Error(`404 {"detail":"Not Found","url":"${url}"}`);
    }
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.blockers[0].code, 'reference_api_missing');
  assert.match(result.blockers[0].detail, /references\/current/);
  assert.equal(result.blockers[1].code, 'reference_refresh_api_missing');
  assert.match(result.recommendedAction, /upgrade|restart|Common Agent/i);
});
