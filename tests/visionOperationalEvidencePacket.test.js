const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildVisionOperationalEvidencePacket,
  mergeVisionOperationalEvidencePacketIntoReleaseConfig
} = require('../scripts/lib/vision-operational-evidence-packet');

const releaseConfig = {
  baselineVersion: {
    modelVersion: 'vision-model-2026.06',
    promptVersion: 'vision-prompt-v5',
    graphVersion: 'approved-graph-42'
  },
  candidateVersion: {
    modelVersion: 'vision-model-2026.07',
    promptVersion: 'vision-prompt-v6',
    graphVersion: 'approved-graph-43'
  },
  latencyTargetP95Ms: 1500,
  minimumSamples: 20,
  caseMetadata: {}
};

test('operational evidence packet pins Common Agent export and candidate Graph snapshot', () => {
  const packet = buildVisionOperationalEvidencePacket({
    generatedAt: '2026-07-27T09:00:00.000Z',
    commonAgentExportUri:
      'common-agent://datasets/images/export/approved-holdout-20260727',
    commonAgentRecordCount: 128,
    graphSnapshotUri:
      'neo4j://mold-master/approved-graph-43/snapshots/release-20260727',
    graphVersion: 'approved-graph-43',
    graphNodeCount: 71,
    graphEdgeCount: 214,
    graphReleaseEvidenceUri:
      'common-agent://graph/release-evidence/approved-graph-43/20260727'
  });
  const merged = mergeVisionOperationalEvidencePacketIntoReleaseConfig(
    releaseConfig,
    packet
  );

  assert.equal(merged.commonAgentEvidenceUri, packet.commonAgentDatasetExport.uri);
  assert.equal(merged.graphEvidenceUri, packet.graphSnapshot.uri);
  assert.equal(
    merged.operationalEvidencePacket.commonAgentDatasetExport.recordCount,
    128
  );
  assert.equal(merged.operationalEvidencePacket.graphSnapshot.graphVersion, 'approved-graph-43');
  assert.deepEqual(
    merged.evidenceBundle.items.map(item => item.kind),
    [
      'common_agent_dataset_export',
      'graph_snapshot',
      'graph_release_evidence'
    ]
  );
  assert.ok(merged.evidenceBundle.items.every(item => item.generatedAt));
});

test('operational evidence packet rejects stale Graph versions and placeholder exports', () => {
  const staleGraphPacket = buildVisionOperationalEvidencePacket({
    generatedAt: '2026-07-27T09:00:00.000Z',
    commonAgentExportUri:
      'common-agent://datasets/images/export/approved-holdout-20260727',
    graphSnapshotUri:
      'neo4j://mold-master/approved-graph-legacy/snapshots/release-20260727',
    graphVersion: 'approved-graph-legacy'
  });

  assert.throws(
    () => mergeVisionOperationalEvidencePacketIntoReleaseConfig(
      releaseConfig,
      staleGraphPacket
    ),
    /candidate graph version/i
  );

  assert.throws(
    () => buildVisionOperationalEvidencePacket({
      generatedAt: '2026-07-27T09:00:00.000Z',
      commonAgentExportUri:
        'common-agent://datasets/images/export/approved-holdout-YYYYMMDD',
      graphSnapshotUri:
        'neo4j://mold-master/approved-graph-43/snapshots/release-20260727',
      graphVersion: 'approved-graph-43'
    }),
    /pinned common agent/i
  );
});
