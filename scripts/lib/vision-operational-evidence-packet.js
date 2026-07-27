const REQUIRED_SCHEMA_VERSION = 'vision-operational-evidence-packet/v1';
const CENTRAL_EVIDENCE_KINDS = new Set([
  'common_agent_dataset_export',
  'common_agent_review_packet',
  'graph_snapshot',
  'graph_release_evidence'
]);

const asString = value => (typeof value === 'string' ? value.trim() : '');

const isPinnedUri = uri => Boolean(asString(uri))
  && !/(?:^|[-_/:.])(latest|unknown|unconfigured|unpinned|placeholder|example|yyyy(?:mm(?:dd)?)?|mm|dd)(?:$|[-_/:.0-9])/i
    .test(uri);

const finitePositiveInteger = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

const assertPinnedUri = (uri, label) => {
  if (!isPinnedUri(uri)) {
    throw new Error(`${label} must be a pinned URI, not a placeholder or latest alias.`);
  }
};

const normalizeIsoTimestamp = value => {
  const timestamp = asString(value) || new Date().toISOString();
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new Error('Vision operational evidence packet generatedAt must be a valid timestamp.');
  }
  return new Date(parsed).toISOString();
};

const buildVisionOperationalEvidencePacket = options => {
  const generatedAt = normalizeIsoTimestamp(options?.generatedAt);
  const commonAgentExportUri = asString(options?.commonAgentExportUri);
  const graphSnapshotUri = asString(options?.graphSnapshotUri);
  const graphVersion = asString(options?.graphVersion);
  assertPinnedUri(commonAgentExportUri, 'Pinned Common Agent export');
  assertPinnedUri(graphSnapshotUri, 'Pinned Graph snapshot');
  if (!graphVersion) {
    throw new Error('Graph version is required for the Vision operational evidence packet.');
  }
  if (!graphSnapshotUri.toLocaleLowerCase().includes(graphVersion.toLocaleLowerCase())) {
    throw new Error('Graph snapshot URI must reference the packet graph version.');
  }

  const packet = {
    schemaVersion: REQUIRED_SCHEMA_VERSION,
    generatedAt,
    commonAgentDatasetExport: {
      uri: commonAgentExportUri,
      generatedAt
    },
    graphSnapshot: {
      uri: graphSnapshotUri,
      graphVersion,
      generatedAt
    }
  };
  const commonAgentRecordCount = finitePositiveInteger(options?.commonAgentRecordCount);
  const graphNodeCount = finitePositiveInteger(options?.graphNodeCount);
  const graphEdgeCount = finitePositiveInteger(options?.graphEdgeCount);
  const graphReleaseEvidenceUri = asString(options?.graphReleaseEvidenceUri);
  const commonAgentReviewPacketUri = asString(options?.commonAgentReviewPacketUri);

  if (commonAgentRecordCount !== undefined) {
    packet.commonAgentDatasetExport.recordCount = commonAgentRecordCount;
  }
  if (graphNodeCount !== undefined) {
    packet.graphSnapshot.nodeCount = graphNodeCount;
  }
  if (graphEdgeCount !== undefined) {
    packet.graphSnapshot.edgeCount = graphEdgeCount;
  }
  if (graphReleaseEvidenceUri) {
    assertPinnedUri(graphReleaseEvidenceUri, 'Graph release evidence');
    packet.graphReleaseEvidence = {
      uri: graphReleaseEvidenceUri,
      generatedAt
    };
  }
  if (commonAgentReviewPacketUri) {
    assertPinnedUri(commonAgentReviewPacketUri, 'Common Agent review packet');
    packet.commonAgentReviewPacket = {
      uri: commonAgentReviewPacketUri,
      generatedAt
    };
  }

  return packet;
};

const normalizeVisionOperationalEvidencePacket = packet => {
  if (!packet || typeof packet !== 'object') {
    throw new Error('Vision operational evidence packet object is required.');
  }
  if (packet.schemaVersion !== REQUIRED_SCHEMA_VERSION) {
    throw new Error('Invalid Vision operational evidence packet schemaVersion.');
  }
  return buildVisionOperationalEvidencePacket({
    generatedAt: packet.generatedAt,
    commonAgentExportUri: packet.commonAgentDatasetExport?.uri,
    commonAgentRecordCount: packet.commonAgentDatasetExport?.recordCount,
    graphSnapshotUri: packet.graphSnapshot?.uri,
    graphVersion: packet.graphSnapshot?.graphVersion,
    graphNodeCount: packet.graphSnapshot?.nodeCount,
    graphEdgeCount: packet.graphSnapshot?.edgeCount,
    graphReleaseEvidenceUri: packet.graphReleaseEvidence?.uri,
    commonAgentReviewPacketUri: packet.commonAgentReviewPacket?.uri
  });
};

const packetEvidenceItems = packet => {
  const items = [
    {
      kind: 'common_agent_dataset_export',
      uri: packet.commonAgentDatasetExport.uri,
      generatedAt: packet.commonAgentDatasetExport.generatedAt,
      label: packet.commonAgentDatasetExport.recordCount === undefined
        ? 'Common Agent approved dataset export'
        : `Common Agent approved dataset export (${packet.commonAgentDatasetExport.recordCount} records)`
    },
    {
      kind: 'graph_snapshot',
      uri: packet.graphSnapshot.uri,
      generatedAt: packet.graphSnapshot.generatedAt,
      label: `Graph snapshot ${packet.graphSnapshot.graphVersion}`
    }
  ];
  if (packet.commonAgentReviewPacket) {
    items.push({
      kind: 'common_agent_review_packet',
      uri: packet.commonAgentReviewPacket.uri,
      generatedAt: packet.commonAgentReviewPacket.generatedAt,
      label: 'Common Agent review packet'
    });
  }
  if (packet.graphReleaseEvidence) {
    items.push({
      kind: 'graph_release_evidence',
      uri: packet.graphReleaseEvidence.uri,
      generatedAt: packet.graphReleaseEvidence.generatedAt,
      label: `Graph release evidence ${packet.graphSnapshot.graphVersion}`
    });
  }
  return items;
};

const mergeVisionOperationalEvidencePacketIntoReleaseConfig = (config, rawPacket) => {
  if (!config || typeof config !== 'object') {
    throw new Error('Vision operational release config object is required.');
  }
  const packet = normalizeVisionOperationalEvidencePacket(rawPacket);
  const candidateGraphVersion = asString(config.candidateVersion?.graphVersion);
  if (!candidateGraphVersion) {
    throw new Error('Release config candidate graph version is required.');
  }
  if (packet.graphSnapshot.graphVersion !== candidateGraphVersion) {
    throw new Error(
      `Evidence packet graph version must match candidate graph version ${candidateGraphVersion}.`
    );
  }
  const existingItems = Array.isArray(config.evidenceBundle?.items)
    ? config.evidenceBundle.items.filter(item => !CENTRAL_EVIDENCE_KINDS.has(item?.kind))
    : [];
  const evidenceItems = [
    ...existingItems,
    ...packetEvidenceItems(packet)
  ];

  return {
    ...config,
    commonAgentEvidenceUri: packet.commonAgentDatasetExport.uri,
    graphEvidenceUri: packet.graphSnapshot.uri,
    evidenceBundle: {
      contractVersion: 'vision-operational-evidence-bundle/v1',
      items: evidenceItems
    },
    operationalEvidencePacket: packet
  };
};

module.exports = {
  buildVisionOperationalEvidencePacket,
  mergeVisionOperationalEvidencePacketIntoReleaseConfig,
  normalizeVisionOperationalEvidencePacket
};
