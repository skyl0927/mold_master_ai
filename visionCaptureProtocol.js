const {
  canonicalDefectClass
} = require('./shared/defect-taxonomy');

const VIEW_DEFINITIONS = {
  full_part_context: {
    label: '전체 제품 사진',
    instruction: '제품 전체와 결함 위치가 함께 보이도록 촬영'
  },
  defect_closeup: {
    label: '결함 근접 사진',
    instruction: '결함 경계와 주변 정상면이 함께 보이도록 근접 촬영'
  },
  oblique_light: {
    label: '사선광 사진',
    instruction: '표면 높이와 광택 차이가 드러나도록 사선광으로 촬영'
  },
  ejection_location: {
    label: '취출 기능부 위치',
    instruction: '밀핀, 리브, 보스 및 취출 접촉 위치가 함께 보이도록 촬영'
  },
  fill_end_context: {
    label: '충전 말단/유동 경로',
    instruction: '게이트부터 충전 말단까지의 위치 관계가 보이도록 촬영'
  },
  reference_part: {
    label: '정상품 비교',
    instruction: '동일 각도와 조명에서 정상품을 함께 촬영'
  },
  vent_context: {
    label: '벤트/가스 배출 위치',
    instruction: '결함부와 인접 벤트 또는 성형 말단 위치가 함께 보이도록 촬영'
  },
  parting_line_context: {
    label: '파팅라인 위치',
    instruction: '결함부와 파팅라인 또는 인서트 경계가 함께 보이도록 촬영'
  },
  edge_profile: {
    label: '경계 측면 사진',
    instruction: '얇은 잉여 수지의 돌출 높이가 보이도록 측면에서 촬영'
  },
  reverse_geometry: {
    label: '반대면 후육 형상',
    instruction: '함몰 반대면의 리브, 보스 또는 후육부 형상을 촬영'
  },
  flow_convergence_context: {
    label: '유동 합류 위치',
    instruction: '게이트와 유동 합류 예상 위치가 함께 보이도록 촬영'
  },
  release_sequence: {
    label: '취출 전후 상태',
    instruction: '금형 개방 직후와 취출 완료 후 상태를 각각 촬영'
  }
};

const BASE_REQUIRED_VIEWS = ['full_part_context', 'defect_closeup'];

const DEFECT_REQUIRED_VIEWS = {
  whitening: ['oblique_light', 'ejection_location'],
  short_shot: ['fill_end_context', 'reference_part'],
  burn: ['fill_end_context', 'vent_context'],
  flash: ['parting_line_context', 'edge_profile'],
  sink: ['oblique_light', 'reverse_geometry'],
  weld_line: ['flow_convergence_context', 'oblique_light'],
  ejection: ['ejection_location', 'release_sequence']
};

const normalizeToken = value => String(value || '')
  .trim()
  .toLocaleLowerCase()
  .replace(/[\s-]+/g, '_');

const VIEW_ALIASES = {
  context: 'full_part_context',
  full: 'full_part_context',
  overview: 'full_part_context',
  full_part: 'full_part_context',
  closeup: 'defect_closeup',
  close_up: 'defect_closeup',
  roi: 'defect_closeup',
  raking_light: 'oblique_light',
  side_light: 'oblique_light',
  ejector: 'ejection_location',
  ejector_pin: 'ejection_location',
  fill_end: 'fill_end_context',
  good_part: 'reference_part',
  golden_sample: 'reference_part',
  parting_line: 'parting_line_context',
  reverse: 'reverse_geometry',
  backside: 'reverse_geometry',
  flow_convergence: 'flow_convergence_context',
  before_after_ejection: 'release_sequence'
};

const asArray = value => Array.isArray(value)
  ? value
  : value === undefined || value === null || value === ''
    ? []
    : [value];

const normalizeViewTags = values => [...new Set(
  asArray(values)
    .map(normalizeToken)
    .map(value => VIEW_ALIASES[value] || value)
    .filter(value => VIEW_DEFINITIONS[value])
)];

const inferVisionImageKind = item => {
  const explicit = normalizeToken(
    item?.captureProtocol?.imageKind
    || item?.metadata?.vision_image_kind
    || item?.metadata?.image_kind
  );
  if (['physical_product', 'document_or_diagram', 'unknown'].includes(explicit)) {
    return explicit;
  }

  const evidenceText = [
    item?.metadata?.vision_suggestion_summary,
    item?.observation?.summary,
    item?.sourceReview?.priorObservationSummary
  ].filter(Boolean).join(' ');
  const documentMarkers = [
    /실제\s*성형품.*사진이\s*아니/,
    /실제\s*제품.*확인할\s*수\s*없/,
    /cad.*(?:설명|도면|슬라이드)/i,
    /(?:설명|문서)\s*슬라이드/,
    /설계\s*(?:자료|도면)/,
    /도면.*(?:개념도|설명|설계)/,
    /개념도/,
    /diagram|schematic/i
  ];
  if (documentMarkers.some(pattern => pattern.test(evidenceText))) {
    return 'document_or_diagram';
  }

  const physicalMarkers = [
    /사출품.*표면/,
    /제품.*표면/,
    /제품.*금형/,
    /결함.*경계/,
    /밀핀.*자국/,
    /파팅라인/
  ];
  return physicalMarkers.some(pattern => pattern.test(evidenceText))
    ? 'physical_product'
    : 'unknown';
};

const requiredViewsFor = defectClass => [
  ...BASE_REQUIRED_VIEWS,
  ...(DEFECT_REQUIRED_VIEWS[defectClass] || [])
];

const buildRecommendation = (status, missingViews) => {
  if (status === 'not_visually_verifiable') {
    return '도면이나 설명 자료가 아닌 실제 성형품 사진을 등록하세요.';
  }

  const instructions = missingViews
    .map(view => VIEW_DEFINITIONS[view]?.instruction)
    .filter(Boolean);
  if (status === 'needs_metadata') {
    return [
      '이미지 종류를 실제 성형품 사진으로 확인하고 촬영 시점 태그를 지정하세요.',
      ...instructions
    ].join(' / ');
  }
  return instructions.length > 0
    ? instructions.join(' / ')
    : '필수 촬영 시점이 충족되었습니다.';
};

const assessVisionCaptureProtocol = testCase => {
  const defectClass = testCase?.expected?.defectClass
    || canonicalDefectClass(testCase?.expected?.defectType);
  const captureProtocol = testCase?.captureProtocol || {};
  const imageKind = inferVisionImageKind(testCase);
  const availableViews = normalizeViewTags(
    [
      captureProtocol.availableViews,
      captureProtocol.viewTags
    ].flatMap(asArray)
  );
  const requiredViews = requiredViewsFor(defectClass);
  const missingViews = requiredViews.filter(view => !availableViews.includes(view));

  let status = 'needs_views';
  if (imageKind === 'document_or_diagram') status = 'not_visually_verifiable';
  else if (imageKind !== 'physical_product') status = 'needs_metadata';
  else if (missingViews.length === 0) status = 'ready';

  return {
    defectClass,
    imageKind,
    status,
    ready: status === 'ready',
    availableViews,
    requiredViews,
    missingViews,
    missingViewLabels: missingViews.map(view => VIEW_DEFINITIONS[view].label),
    recommendation: buildRecommendation(status, missingViews)
  };
};

module.exports = {
  BASE_REQUIRED_VIEWS,
  DEFECT_REQUIRED_VIEWS,
  VIEW_DEFINITIONS,
  assessVisionCaptureProtocol,
  inferVisionImageKind,
  normalizeViewTags,
  requiredViewsFor
};
