const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildVisionReferenceBackfillApplyRequests,
  runVisionReferenceBackfillApply
} = require('../visionReferenceBackfillApply');

const writePlan = {
  authorizationId: 'vision-reference-backfill-abc',
  authorizedBy: 'reviewer-01',
  authorizedAt: '2026-07-27T04:00:00.000Z',
  backfillPlanDigest: 'a'.repeat(64),
  serviceWritesPerformed: false,
  targets: [
    {
      imageId: 'image white/1',
      defectType: 'whitening',
      reviewPayload: {
        decision: 'approve',
        defect_type: 'whitening',
        observation_summary: 'white discoloration near rib',
        visible_features: ['white discoloration near rib'],
        labels: ['whitening'],
        promote_to_graph: false,
        metadata: {
          reference_backfill_human_authorized: true,
          capture_session_id: 'session-white-01',
          capture_view_tag: 'defect_closeup',
          capture_protocol_ready: true
        },
        observation: {
          contract_version: 'vision-observation/v2',
          image_kind: 'physical_product',
          normality_status: 'defect_visible',
          summary: 'white discoloration near rib',
          observations: [{
            observation_id: 'human-backfill-obs-1',
            category: 'other',
            description: 'white discoloration near rib',
            confidence: 0.8
          }],
          candidates: [{
            defect_type: 'whitening',
            confidence: 0.8,
            supporting_observation_ids: ['human-backfill-obs-1']
          }]
        }
      }
    }
  ]
};

test('dry-run apply builds encoded review requests without service writes', async () => {
  let fetchCalled = false;
  const result = await runVisionReferenceBackfillApply({
    writePlan,
    agentUrl: 'http://agent.test/',
    apply: false,
    fetchJson: async () => {
      fetchCalled = true;
      return {};
    }
  });

  assert.equal(fetchCalled, false);
  assert.equal(result.serviceWritesPerformed, false);
  assert.equal(result.requests.length, 1);
  assert.equal(
    result.requests[0].url,
    'http://agent.test/v1/datasets/images/image%20white%2F1/review'
  );
  assert.equal(result.requests[0].method, 'POST');
  assert.equal(result.requests[0].body.decision, 'approve');
  assert.equal(result.requests[0].body.promote_to_graph, false);
  assert.equal(result.requests[0].body.observation.contract_version, 'vision-observation/v2');
});

test('apply mode posts each authorized review payload and audits responses', async () => {
  const calls = [];
  const result = await runVisionReferenceBackfillApply({
    writePlan,
    agentUrl: 'http://agent.test',
    apply: true,
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      return {
        status: 'reviewed',
        item: {
          image_id: 'image white/1',
          review_status: 'approved',
          observation: { contract_version: 'vision-observation/v2' },
          metadata: {
            capture_protocol_ready: true
          }
        }
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).metadata.capture_protocol_ready, true);
  assert.equal(result.serviceWritesPerformed, true);
  assert.equal(result.results[0].status, 'applied');
  assert.equal(result.results[0].learningReadySignals.reviewStatus, 'approved');
  assert.equal(result.results[0].learningReadySignals.observationContractVersion, 'vision-observation/v2');
  assert.equal(result.results[0].learningReadySignals.captureProtocolReady, true);
});

test('apply refuses write plans without authorized v2 observations', () => {
  assert.throws(
    () => buildVisionReferenceBackfillApplyRequests({
      writePlan: {
        ...writePlan,
        targets: [{
          ...writePlan.targets[0],
          reviewPayload: {
            ...writePlan.targets[0].reviewPayload,
            observation: { contract_version: 'vision-observation/v1' }
          }
        }]
      },
      agentUrl: 'http://agent.test'
    }),
    /vision-observation\/v2/
  );
});

test('apply mode records failed targets and stops before later writes', async () => {
  const twoTargetPlan = {
    ...writePlan,
    targets: [
      writePlan.targets[0],
      {
        ...writePlan.targets[0],
        imageId: 'second-image'
      }
    ]
  };
  const calls = [];
  const result = await runVisionReferenceBackfillApply({
    writePlan: twoTargetPlan,
    agentUrl: 'http://agent.test',
    apply: true,
    fetchJson: async url => {
      calls.push(url);
      throw new Error('503 unavailable');
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(result.serviceWritesPerformed, true);
  assert.equal(result.results[0].status, 'failed');
  assert.match(result.results[0].error, /503 unavailable/);
  assert.equal(result.results.length, 1);
});
