const crypto = require('node:crypto');
const path = require('node:path');

const asArray = value => Array.isArray(value) ? value : [];

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const unique = values => [...new Set(asArray(values).map(compact).filter(Boolean))];

const numberFrom = (...values) => {
  const found = values.find(value => Number.isFinite(Number(value)));
  return found === undefined ? 0 : Number(found);
};

const isContract = (artifact, contractVersion) =>
  artifact?.contractVersion === contractVersion;

const sha256 = text =>
  crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');

const policy = () => ({
  requiresHumanReview: true,
  autoApplyAllowed: false,
  automaticServiceWritesAllowed: false,
  allowGraphPromotion: false,
  allowReferenceLearning: false,
  allowModelTraining: false
});

const queueSlug = queueCode =>
  compact(queueCode).replace(/_/g, '-').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '');

const editableFileName = (section, index) =>
  `${String(index + 1).padStart(2, '0')}-${queueSlug(section.queueCode) || 'hitl-decision'}.decisions.json`;

const quoted = filePath => `"${String(filePath).replace(/"/g, '\\"')}"`;

const verifyCommandFor = (command, editablePath) => {
  const normalized = compact(command);
  if (!normalized) return `verify-decisions --decisions ${quoted(editablePath)}`;
  if (/--decisions\s+<[^>]+>/.test(normalized)) {
    return normalized.replace(/--decisions\s+<[^>]+>/, `--decisions ${quoted(editablePath)}`);
  }
  if (/--decisions\s+"[^"]+"/.test(normalized)) {
    return normalized.replace(/--decisions\s+"[^"]+"/, `--decisions ${quoted(editablePath)}`);
  }
  return `${normalized} --decisions ${quoted(editablePath)}`;
};

const missingEvidenceManifest = (generatedAt, workspaceRoot, sourceArtifacts) => ({
  schemaVersion: 1,
  contractVersion: 'operational-hitl-editable-decision-workspace/v1',
  generatedAt,
  sourceSystem: 'mold-master-ai',
  targetSystem: 'operator_common_agent',
  status: 'missing_evidence',
  workspaceRoot,
  serviceWritesPerformed: false,
  localArtifactsWritten: false,
  policy: policy(),
  summary: {
    missingArtifacts: 1,
    missingArtifactNames: ['inputReviewPacket'],
    totalDecisionInputsMissing: 0,
    workspaceFileCount: 0,
    copiedSourceFileCount: 0,
    missingSourceTemplateCount: 0,
    firstEditableQueueCode: null
  },
  editableFiles: [],
  writtenArtifacts: [],
  readmePath: null,
  manifestPath: null,
  sources: {
    inputReviewPacket: sourceArtifacts.inputReviewPacket || null
  },
  recommendedAction: '먼저 npm run operational:hitl:decision-review-packet으로 입력 검토 패킷을 생성하세요.'
});

const sectionToEditableFile = (section, index, workspaceRoot) => {
  const editablePath = path.join(workspaceRoot, editableFileName(section, index));
  return {
    queueCode: compact(section.queueCode),
    titleKo: compact(section.titleKo) || compact(section.queueCode),
    owner: compact(section.owner) || 'quality_hitl',
    sourceArtifact: compact(section.sourceArtifact),
    editablePath,
    sourcePreserved: true,
    targetPending: numberFrom(section.targetPending),
    pendingActions: numberFrom(section.pendingActions),
    allowedActions: unique(section.allowedActions),
    requiredFields: unique(section.requiredFields),
    decisionIdentifierField: compact(section.decisionIdentifierField),
    decisionIdsPreview: unique(section.decisionIdsPreview).slice(0, 10),
    verifyCommand: verifyCommandFor(section.verificationCommand, editablePath)
  };
};

const readmeFor = manifest => {
  const lines = [
    '# Operational HITL Editable Decision Workspace',
    '',
    `- 생성 시각: ${manifest.generatedAt}`,
    `- 남은 입력: ${manifest.summary.totalDecisionInputsMissing}`,
    `- 첫 처리 큐: ${manifest.summary.firstEditableQueueCode || '없음'}`,
    '- 원본 template 파일은 수정하지 마세요. 이 폴더의 `.decisions.json` 복사본만 수정하세요.',
    '- 검증 전까지 Common Agent, SQL, Graph DB, Reference store, 모델 학습에는 반영되지 않습니다.',
    '',
    '## 작성 순서',
    ''
  ];

  manifest.editableFiles.forEach((item, index) => {
    lines.push(
      `### ${index + 1}. ${item.queueCode}`,
      '',
      `- 제목: ${item.titleKo}`,
      `- 담당: ${item.owner}`,
      `- 수정 파일: ${item.editablePath}`,
      `- 원본 template: ${item.sourceArtifact}`,
      `- 남은 입력: ${item.targetPending}`,
      `- 허용 action: ${item.allowedActions.join(', ') || '원본 파일 확인'}`,
      `- 필수 필드: ${item.requiredFields.join(', ') || '원본 파일 확인'}`,
      `- 결정 ID 미리보기: ${item.decisionIdsPreview.join(', ') || item.decisionIdentifierField || '원본 파일 확인'}`,
      '- 검증 명령:',
      '```powershell',
      item.verifyCommand,
      '```',
      ''
    );
  });

  return `${lines.join('\n')}\n`;
};

const baseManifest = ({
  generatedAt,
  workspaceRoot,
  inputReviewPacket,
  sourceArtifacts
}) => {
  const sections = asArray(inputReviewPacket.sections);
  const summary = inputReviewPacket.summary || {};
  const editableFiles = sections.map((section, index) =>
    sectionToEditableFile(section, index, workspaceRoot)
  );
  const firstEditableQueueCode = compact(summary.firstQueueCode)
    || editableFiles.find(item => item.targetPending > 0)?.queueCode
    || editableFiles[0]?.queueCode
    || null;
  const readmePath = path.join(workspaceRoot, 'README.md');
  const manifestPath = path.join(workspaceRoot, 'manifest.json');

  return {
    schemaVersion: 1,
    contractVersion: 'operational-hitl-editable-decision-workspace/v1',
    generatedAt,
    sourceSystem: 'mold-master-ai',
    targetSystem: 'operator_common_agent',
    status: 'ready_for_human_edit',
    workspaceRoot,
    serviceWritesPerformed: false,
    localArtifactsWritten: true,
    policy: policy(),
    summary: {
      missingArtifacts: 0,
      missingArtifactNames: [],
      totalDecisionInputsMissing: numberFrom(summary.targetDecisionInputsMissing),
      totalPendingActions: numberFrom(summary.totalPendingActions),
      totalTemplateItems: numberFrom(summary.totalTemplateItems),
      workspaceFileCount: editableFiles.length,
      copiedSourceFileCount: 0,
      missingSourceTemplateCount: 0,
      firstEditableQueueCode
    },
    editableFiles,
    writtenArtifacts: [],
    readmePath,
    manifestPath,
    sources: {
      inputReviewPacket: sourceArtifacts.inputReviewPacket || null
    },
    recommendedAction: editableFiles[0]
      ? `${path.basename(editableFiles[0].editablePath)}부터 수정하고 workspace README의 검증 명령을 실행하세요.`
      : '수정할 HITL decision file이 없습니다. 검증 명령을 실행해 현재 상태를 확인하세요.'
  };
};

const missingSourceManifest = (manifest, missingSources) => ({
  ...manifest,
  status: 'missing_source_templates',
  localArtifactsWritten: false,
  summary: {
    ...manifest.summary,
    copiedSourceFileCount: 0,
    missingSourceTemplateCount: missingSources.length
  },
  editableFiles: manifest.editableFiles.map(item => ({
    ...item,
    sourceAvailable: !missingSources.includes(item.sourceArtifact)
  })),
  writtenArtifacts: [],
  recommendedAction: 'decision template 원본 파일이 없거나 읽을 수 없습니다. npm run operational:hitl:prepare-run을 다시 실행한 뒤 workspace를 재생성하세요.'
});

const manifestForWrite = manifest => JSON.stringify(manifest, null, 2) + '\n';

const createOperationalHitlEditableDecisionWorkspace = ({
  generatedAt = new Date().toISOString(),
  inputReviewPacket = null,
  workspaceRoot = path.join('artifacts', 'operational-hitl-editable-decision-workspace'),
  sourceArtifacts = {},
  readFileText = () => null,
  writeFileText = () => {}
} = {}) => {
  if (!isContract(inputReviewPacket, 'operational-hitl-decision-input-review-packet/v1')) {
    return missingEvidenceManifest(generatedAt, workspaceRoot, sourceArtifacts);
  }

  const manifest = baseManifest({
    generatedAt,
    workspaceRoot,
    inputReviewPacket,
    sourceArtifacts
  });
  const sourceContents = manifest.editableFiles.map(item => ({
    file: item,
    content: readFileText(item.sourceArtifact)
  }));
  const missingSources = sourceContents
    .filter(item => typeof item.content !== 'string')
    .map(item => item.file.sourceArtifact);
  if (missingSources.length > 0) {
    return missingSourceManifest(manifest, missingSources);
  }

  sourceContents.forEach(item => {
    writeFileText(item.file.editablePath, item.content);
    item.file.sourceSha256 = sha256(item.content);
    item.file.editableSha256 = sha256(item.content);
    item.file.byteLength = Buffer.byteLength(item.content, 'utf8');
    manifest.writtenArtifacts.push({
      path: item.file.editablePath,
      kind: 'editable_decision_copy',
      queueCode: item.file.queueCode,
      byteLength: item.file.byteLength,
      sha256: item.file.editableSha256
    });
  });

  manifest.summary.copiedSourceFileCount = sourceContents.length;
  const readme = readmeFor(manifest);
  writeFileText(manifest.readmePath, readme);
  manifest.writtenArtifacts.push({
    path: manifest.readmePath,
    kind: 'reviewer_readme',
    byteLength: Buffer.byteLength(readme, 'utf8'),
    sha256: sha256(readme)
  });

  const manifestText = manifestForWrite(manifest);
  writeFileText(manifest.manifestPath, manifestText);
  manifest.writtenArtifacts.push({
    path: manifest.manifestPath,
    kind: 'workspace_manifest',
    byteLength: Buffer.byteLength(manifestText, 'utf8'),
    sha256: sha256(manifestText)
  });

  return manifest;
};

module.exports = {
  createOperationalHitlEditableDecisionWorkspace
};
