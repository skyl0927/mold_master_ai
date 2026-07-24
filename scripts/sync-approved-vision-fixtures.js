const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass,
  findDuplicateImageGroups
} = require('./lib/multimodal-benchmark');
const {
  extractOriginalVisionDefectType,
  findObservationLabelConflict
} = require('./lib/approved-vision-fixture-quality');

const root = process.cwd();
const baseUrl = (process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const outputDir = path.resolve(
  process.argv[2] || path.join(root, 'eval', 'vision-approved')
);

const isClassifiable = value => {
  const normalized = String(value || '').toLocaleLowerCase().replace(/\s+/g, '');
  return Boolean(
    normalized
    && !['unknown', 'unclassified', '판정불가', '미정', '불분명', '확인불가']
      .some(marker => normalized.includes(marker))
  );
};

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const run = async () => {
  const response = await fetch(
    `${baseUrl}/v1/datasets/images?review_status=approved&include_hidden=false&limit=500`
  );
  if (!response.ok) {
    throw new Error(`Approved image query failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  const approvedItems = (payload.items || []).filter(item =>
    item.review_status === 'approved' && isClassifiable(item.defect_type)
  );
  const items = await Promise.all(approvedItems.map(async item => {
    const [imageResponse, annotationResponse] = await Promise.all([
      fetch(`${baseUrl}/v1/datasets/images/${encodeURIComponent(item.image_id)}/file`),
      fetch(`${baseUrl}/v1/datasets/images/${encodeURIComponent(item.image_id)}/annotations`)
    ]);
    if (!imageResponse.ok) {
      throw new Error(`Image hash download failed for ${item.image_id}: ${imageResponse.status}`);
    }
    const contentHash = createHash('sha256')
      .update(Buffer.from(await imageResponse.arrayBuffer()))
      .digest('hex');
    const annotationPayload = annotationResponse.ok ? await annotationResponse.json() : { items: [] };
    const roiAnnotation = (annotationPayload.items || []).find(annotation =>
      annotation.annotation_type === 'bbox'
      && annotation.bbox?.coordinate_system === 'normalized_xywh'
    );
    return {
      ...item,
      contentHash,
      roiNormalized: roiAnnotation?.bbox
        ? {
            x: roiAnnotation.bbox.x,
            y: roiAnnotation.bbox.y,
            width: roiAnnotation.bbox.width,
            height: roiAnnotation.bbox.height
          }
        : undefined
    };
  }));

  fs.mkdirSync(outputDir, { recursive: true });
  const fixtureDrafts = items.map(item => ({
    id: `approved-${item.image_id}`,
    contentHash: item.contentHash,
    expected: { defectType: item.defect_type }
  }));
  const duplicateQualityIssues = findDuplicateImageGroups(fixtureDrafts);
  const duplicateConflictIssues = duplicateQualityIssues.filter(
    issue => issue.type === 'duplicate_image_conflicting_labels'
  );
  const sameLabelDuplicateIssues = duplicateQualityIssues.filter(
    issue => issue.type === 'duplicate_image_same_label'
  );
  const observationConflictIssues = items
    .map(findObservationLabelConflict)
    .filter(Boolean);
  const qualityIssues = [
    ...duplicateQualityIssues,
    ...observationConflictIssues
  ];
  const duplicateConflictedCaseIds = new Set(
    duplicateConflictIssues.flatMap(issue => issue.caseIds)
  );
  const observationConflictedCaseIds = new Set(
    observationConflictIssues.map(issue => issue.caseId)
  );
  const duplicateCaseIds = new Set(sameLabelDuplicateIssues.flatMap(
    issue => [...issue.caseIds].sort().slice(1)
  ));
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: `${baseUrl}/v1/datasets/images`,
    minimumSamples: 20,
    evaluationGate: {
      requiredDefectClasses: REQUIRED_DEFECT_CLASSES,
      minimumSamplesPerClass: 2,
      minimumVisionConfidence: 0.6,
      minimumConfidentRate: 80,
      minimumClassAccuracy: 50
    },
    qualityIssues,
    cases: []
  };

  for (const item of items) {
    const fixtureName = `${item.image_id}.json`;
    const observation = item.observation || {};
    const context = [
      compact(item.question),
      compact(item.metadata?.review_comment)
    ].filter(Boolean).join(' / ');
    const fixture = {
      id: `approved-${item.image_id}`,
      title: `${item.defect_type} approved image`,
      commonAgentImageId: item.image_id,
      fileName: item.file_name,
      mimeType: item.mime_type,
      contentHash: item.contentHash,
      roiNormalized: item.roiNormalized,
      inputNotes: context,
      expected: {
        defectType: item.defect_type,
        defectClass: canonicalDefectClass(item.defect_type),
        possibleCauseKeywords: [],
        countermeasureKeywords: [],
        minEvidenceCount: 1
      },
      sourceReview: {
        reviewStatus: item.review_status,
        reviewedAt: item.metadata?.last_reviewed_at,
        sourceSystem: item.source_system,
        priorObservationDefectType: observation.defect_type,
        originalVisionDefectType: extractOriginalVisionDefectType(item),
        priorObservationSummary: observation.summary
      }
    };
    fs.writeFileSync(
      path.join(outputDir, fixtureName),
      `${JSON.stringify(fixture, null, 2)}\n`,
      'utf8'
    );
    const isDuplicateConflict = duplicateConflictedCaseIds.has(fixture.id);
    const isObservationConflict = observationConflictedCaseIds.has(fixture.id);
    const isConflict = isDuplicateConflict || isObservationConflict;
    const isDuplicate = duplicateCaseIds.has(fixture.id);
    manifest.cases.push({
      id: fixture.id,
      file: fixtureName,
      status: isConflict ? 'needs_review' : isDuplicate ? 'duplicate' : 'active',
      tags: [
        'approved-image',
        'vision',
        'graph',
        ...(isDuplicateConflict ? ['duplicate-label-conflict'] : []),
        ...(isObservationConflict ? ['vision-label-conflict'] : []),
        ...(isDuplicate ? ['duplicate-same-image'] : [])
      ]
    });
  }

  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  console.log(`Approved Vision fixtures: ${items.length}`);
  console.log(
    `Label conflicts requiring HITL: ${
      duplicateConflictIssues.length + observationConflictIssues.length
    }`
  );
  console.log(`Vision-label conflicts quarantined: ${observationConflictIssues.length}`);
  console.log(`Same-label duplicate fixtures excluded: ${duplicateCaseIds.size}`);
  console.log(`Manifest: ${path.join(outputDir, 'manifest.json')}`);
  const runnableCount = manifest.cases.filter(item => item.status === 'active').length;
  console.log(`Runnable approved fixtures: ${runnableCount}`);
  if (runnableCount < manifest.minimumSamples) {
    console.log(`Additional clean approved images required: ${manifest.minimumSamples - runnableCount}`);
  }
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
