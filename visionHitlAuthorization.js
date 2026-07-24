const crypto = require('node:crypto');
const { canonicalDefectClass } = require('./shared/defect-taxonomy');

const AUTHORIZATION_STATEMENT = 'I_CONFIRM_EACH_IMAGE_AND_LABEL';
const HIGH_CONFIDENCE_BUCKET = 'agreement_high_confidence';

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeHash = value => compact(value).toLowerCase();

const datasetItemHash = item => normalizeHash(item?.metadata?.content_sha256);

const candidateIdentity = candidate => ({
  relativePath: String(candidate?.relativePath || '').replace(/\\/g, '/'),
  contentSha256: normalizeHash(candidate?.contentSha256),
  defectType: compact(candidate?.defectType),
  defectClass: compact(candidate?.defectClass),
  reviewPriority: Number(candidate?.reviewPriority) || null,
  reviewBucket: compact(candidate?.reviewBucket),
  labelEvidence: {
    sourceLabel: compact(candidate?.labelEvidence?.sourceLabel),
    visionSuggestedLabel: compact(candidate?.labelEvidence?.visionSuggestedLabel),
    visionConfidence: Number(candidate?.labelEvidence?.visionConfidence) || 0,
    conflict: candidate?.labelEvidence?.conflict !== false
  },
  sourceLineage: {
    packetSourceKind: compact(candidate?.sourceLineage?.packetSourceKind),
    webCaseId: compact(candidate?.sourceLineage?.webCaseId),
    knowledgeId: compact(candidate?.sourceLineage?.knowledgeId),
    sourceDocumentId: compact(candidate?.sourceLineage?.sourceDocumentId)
  }
});

const computeVisionPacketDigest = manifest => {
  const identity = {
    schemaVersion: Number(manifest?.schemaVersion) || null,
    generatedAt: compact(manifest?.generatedAt),
    candidates: (Array.isArray(manifest?.candidates) ? manifest.candidates : [])
      .map(candidateIdentity)
      .sort((left, right) =>
        left.contentSha256.localeCompare(right.contentSha256)
        || left.relativePath.localeCompare(right.relativePath)
      )
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex');
};

const isHighConfidenceCandidate = candidate => {
  const defectClass = compact(candidate?.defectClass);
  const sourceClass = canonicalDefectClass(
    candidate?.labelEvidence?.sourceLabel || candidate?.defectType
  );
  const visionClass = canonicalDefectClass(
    candidate?.labelEvidence?.visionSuggestedLabel
  );
  return Number(candidate?.reviewPriority) === 1
    && compact(candidate?.reviewBucket) === HIGH_CONFIDENCE_BUCKET
    && /^[a-f0-9]{64}$/.test(normalizeHash(candidate?.contentSha256))
    && candidate?.labelEvidence?.conflict === false
    && Number(candidate?.labelEvidence?.visionConfidence) >= 0.6
    && sourceClass === defectClass
    && visionClass === defectClass;
};

const isTerminalDatasetItem = item =>
  ['approved', 'rejected'].includes(compact(item?.review_status).toLowerCase());

const summarizeByClass = targets => Object.fromEntries(
  [...new Set(targets.map(item => item.defectClass))]
    .sort()
    .map(defectClass => [
      defectClass,
      targets.filter(item => item.defectClass === defectClass).length
    ])
);

const buildVisionHitlAuthorizationTemplate = ({
  manifest,
  packetRoot,
  datasetItems = [],
  generatedAt = new Date().toISOString()
}) => {
  const items = Array.isArray(datasetItems) ? datasetItems : [];
  const terminalHashes = new Set(
    items.filter(isTerminalDatasetItem).map(datasetItemHash).filter(Boolean)
  );
  const targets = (Array.isArray(manifest?.candidates) ? manifest.candidates : [])
    .filter(isHighConfidenceCandidate)
    .filter(candidate => !terminalHashes.has(normalizeHash(candidate.contentSha256)))
    .map(candidate => ({
      relativePath: String(candidate.relativePath || '').replace(/\\/g, '/'),
      contentSha256: normalizeHash(candidate.contentSha256),
      defectType: compact(candidate.defectType),
      defectClass: compact(candidate.defectClass),
      sourceLabel: compact(candidate.labelEvidence?.sourceLabel),
      visionSuggestedLabel: compact(candidate.labelEvidence?.visionSuggestedLabel),
      visionConfidence: Number(candidate.labelEvidence?.visionConfidence) || 0,
      sourceKind: compact(candidate.sourceLineage?.packetSourceKind),
      sourceReference: compact(
        candidate.sourceLineage?.webCaseId
        || candidate.sourceLineage?.knowledgeId
        || candidate.sourceLineage?.sourceDocumentId
      ),
      decision: 'pending',
      manufacturingImageConfirmed: false,
      labelConfirmed: false,
      approvedDefectType: compact(candidate.defectType),
      reviewComment: ''
    }));
  const packetDigest = computeVisionPacketDigest(manifest);

  return {
    schemaVersion: 1,
    authorizationId: `vision-hitl-${packetDigest.slice(0, 16)}`,
    generatedAt,
    packetRoot: compact(packetRoot),
    packetDigest,
    authorizationStatement: 'PENDING_HUMAN_REVIEW',
    authorizedBy: '',
    authorizedAt: '',
    instructions: [
      'Open every original image in Mold Master AI before changing a target.',
      'Set decision to approve only after confirming the manufacturing image and final label.',
      `Set authorizationStatement to ${AUTHORIZATION_STATEMENT} after every selected target is reviewed.`,
      'Removing an unreviewed target is allowed; adding a hash not bound to this packet is blocked.'
    ],
    summary: {
      totalTargets: targets.length,
      targetsByClass: summarizeByClass(targets),
      writesPerformed: false
    },
    targets
  };
};

const validateVisionHitlAuthorization = ({
  authorization,
  manifest,
  datasetItems = []
}) => {
  if (!authorization || Number(authorization.schemaVersion) !== 1) {
    throw new Error('Vision HITL authorization schemaVersion must be 1.');
  }
  const expectedDigest = computeVisionPacketDigest(manifest);
  if (normalizeHash(authorization.packetDigest) !== expectedDigest) {
    throw new Error('Vision HITL authorization packet digest does not match the current packet.');
  }
  if (compact(authorization.authorizationStatement) !== AUTHORIZATION_STATEMENT) {
    throw new Error(`authorizationStatement must be ${AUTHORIZATION_STATEMENT}.`);
  }
  if (compact(authorization.authorizedBy).length < 2) {
    throw new Error('authorizedBy must identify the human reviewer.');
  }
  if (!Number.isFinite(Date.parse(String(authorization.authorizedAt || '')))) {
    throw new Error('authorizedAt must be a valid human-review timestamp.');
  }

  const targets = Array.isArray(authorization.targets) ? authorization.targets : [];
  if (targets.length === 0) {
    throw new Error('Vision HITL authorization must include at least one target.');
  }
  const packetCandidates = new Map(
    (Array.isArray(manifest?.candidates) ? manifest.candidates : [])
      .filter(isHighConfidenceCandidate)
      .map(candidate => [normalizeHash(candidate.contentSha256), candidate])
  );
  const dataset = Array.isArray(datasetItems) ? datasetItems : [];
  const seen = new Set();

  const validatedTargets = targets.map((target, index) => {
    const prefix = `targets[${index}]`;
    const contentSha256 = normalizeHash(target?.contentSha256);
    if (seen.has(contentSha256)) {
      throw new Error(`${prefix} has a duplicate target hash.`);
    }
    seen.add(contentSha256);
    const candidate = packetCandidates.get(contentSha256);
    if (!candidate) {
      throw new Error(`${prefix} is not an unresolved high-confidence packet candidate.`);
    }
    if (compact(target.decision).toLowerCase() !== 'approve') {
      throw new Error(`${prefix} decision must be approve.`);
    }
    if (target.manufacturingImageConfirmed !== true) {
      throw new Error(`${prefix} manufacturing image confirmation is required.`);
    }
    if (target.labelConfirmed !== true) {
      throw new Error(`${prefix} label confirmation is required.`);
    }
    if (compact(target.reviewComment).length < 8) {
      throw new Error(`${prefix} reviewComment must describe the human verification.`);
    }

    const approvedDefectType = compact(target.approvedDefectType);
    const approvedClass = canonicalDefectClass(approvedDefectType);
    if (!approvedDefectType || approvedClass !== compact(candidate.defectClass)) {
      throw new Error(`${prefix} approved label does not match the packet class.`);
    }
    const matches = dataset.filter(item => datasetItemHash(item) === contentSha256);
    const conflictingApproved = matches.find(item =>
      compact(item.review_status).toLowerCase() === 'approved'
      && canonicalDefectClass(item.defect_type) !== approvedClass
    );
    if (conflictingApproved) {
      throw new Error(
        `${prefix} has a conflicting approved label: ${conflictingApproved.defect_type || 'unknown'}.`
      );
    }
    const rejected = matches.find(item =>
      compact(item.review_status).toLowerCase() === 'rejected'
    );
    if (rejected) {
      throw new Error(`${prefix} was already rejected and requires manual reconciliation.`);
    }
    const alreadyApproved = matches.some(item =>
      compact(item.review_status).toLowerCase() === 'approved'
      && canonicalDefectClass(item.defect_type) === approvedClass
    );

    return {
      candidateId: `local-${contentSha256.slice(0, 20)}`,
      relativePath: String(candidate.relativePath || '').replace(/\\/g, '/'),
      fileName: String(candidate.relativePath || '').replace(/\\/g, '/').split('/').at(-1),
      contentSha256,
      defectType: approvedDefectType,
      defectClass: approvedClass,
      fieldContext: compact(candidate.fieldContext),
      reviewComment: compact(target.reviewComment),
      alreadyApproved
    };
  });

  return {
    authorizationId: compact(authorization.authorizationId),
    authorizedBy: compact(authorization.authorizedBy),
    authorizedAt: new Date(authorization.authorizedAt).toISOString(),
    packetDigest: expectedDigest,
    targets: validatedTargets
  };
};

module.exports = {
  AUTHORIZATION_STATEMENT,
  buildVisionHitlAuthorizationTemplate,
  computeVisionPacketDigest,
  validateVisionHitlAuthorization
};
