const REQUIRED_DEFECT_CLASSES = [
  'whitening',
  'short_shot',
  'burn',
  'flash',
  'sink',
  'weld_line',
  'ejection'
];

const DEFECT_CLASS_ALIASES = [
  ['whitening', ['\uBC31\uD654', 'whitening', 'stresswhite']],
  ['short_shot', ['\uBBF8\uC131\uD615', 'shortshot', 'shortfill']],
  ['burn', [
    '\uD751\uC810',
    '\uD0C4\uD654',
    '\uAC00\uC2A4\uD0D0',
    '\uBC88\uB9C8\uD06C',
    'burnmark',
    'blackspeck'
  ]],
  ['flash', ['\uD50C\uB798\uC2DC', 'flash', 'burr', '\uBC14\uB9AC']],
  ['sink', ['\uC2F1\uD06C\uB9C8\uD06C', '\uC2F1\uD06C', 'sinkmark']],
  ['weld_line', ['\uC6F0\uB4DC\uB77C\uC778', '\uC6F0\uB4DC', 'weldline', 'knitline']],
  ['ejection', [
    '\uBC00\uD540',
    '\uCDE8\uCD9C',
    '\uC774\uD615\uBD88\uB7C9',
    '\uAE08\uD615\uC774\uD0C8\uC548\uB428',
    '\uAE08\uD615\uC774\uD0C8\uC548\uB40C',
    '\uB538\uB824\uAC10',
    'sticking',
    'ejector',
    'ejection'
  ]],
  ['delamination', ['\uBC15\uB9AC', 'delamination', 'layerpeeling']],
  ['jetting', ['\uC81C\uD305', 'jetting']],
  ['gloss_variation', ['\uAD11\uD0DD\uBD88\uADE0\uC77C', 'glossvariation', 'glossdifference']],
  ['cold_slug', ['\uCF5C\uB4DC\uC2AC\uB7EC\uADF8', 'coldslug']],
  ['air_trap', ['\uACF5\uAE30\uAC07\uD798', '\uACF5\uAE30\uD3EC\uD68D', 'airentrapment', 'airtrap']],
  ['void', ['\uBCF4\uC774\uB4DC', 'void', 'porosity']],
  ['dull_spot', ['\uBB34\uAD11\uBC18\uC810', 'dullspot']],
  ['flow_mark', ['\uC720\uB3D9\uC790\uAD6D', 'flowmark', 'recordgroove']],
  ['color_streak', ['\uCC29\uC0C9\uC904\uBB34\uB2AC', 'coloredstreak', 'colourstreak']],
  ['silver_streak', ['\uC740\uC904', '\uC218\uBD84\uC904\uBB34\uB2AC', 'moisturestreak', 'silverstreak', 'splay']],
  ['reinforcement_streak', ['\uBCF4\uAC15\uC7AC\uC904\uBB34\uB2AC', 'reinforcementstreak']],
  ['tiger_stripe', ['\uD0C0\uC774\uAC70\uB77C\uC778', 'tigerline', 'tigerstripe']],
  ['stress_crack', ['\uC751\uB825\uADE0\uC5F4', 'stresscrack']],
  ['unmelted_material', ['\uBBF8\uC6A9\uC735\uC218\uC9C0', 'unmoltenmaterial', 'unmeltedmaterial']],
  ['warpage', ['\uBCC0\uD615', '\uD718', 'warpage', 'warping']],
  ['mold_deposit', ['\uAE08\uD615\uD1F4\uC801\uBB3C', 'molddeposit', 'moulddeposit', 'plateout']]
];

const DEFECT_CLASS_LABELS = {
  whitening: '\uBC31\uD654',
  short_shot: '\uBBF8\uC131\uD615',
  burn: '\uD751\uC810/\uD0C4\uD654',
  flash: '\uD50C\uB798\uC2DC',
  sink: '\uC2F1\uD06C',
  weld_line: '\uC6F0\uB4DC\uB77C\uC778',
  ejection: '\uCDE8\uCD9C/\uC774\uD615',
  delamination: '\uBC15\uB9AC',
  jetting: '\uC81C\uD305',
  gloss_variation: '\uAD11\uD0DD \uBD88\uADE0\uC77C',
  cold_slug: '\uCF5C\uB4DC \uC2AC\uB7EC\uADF8',
  air_trap: '\uACF5\uAE30 \uAC07\uD798',
  void: '\uBCF4\uC774\uB4DC',
  dull_spot: '\uBB34\uAD11 \uBC18\uC810',
  flow_mark: '\uC720\uB3D9 \uC790\uAD6D',
  color_streak: '\uCC29\uC0C9 \uC904\uBB34\uB2AC',
  silver_streak: '\uC740\uC904/\uC218\uBD84 \uC904\uBB34\uB2AC',
  reinforcement_streak: '\uBCF4\uAC15\uC7AC \uC904\uBB34\uB2AC',
  tiger_stripe: '\uD0C0\uC774\uAC70 \uB77C\uC778',
  stress_crack: '\uC751\uB825 \uADE0\uC5F4',
  unmelted_material: '\uBBF8\uC6A9\uC735 \uC218\uC9C0',
  warpage: '\uBCC0\uD615/\uD718',
  mold_deposit: '\uAE08\uD615 \uD1F4\uC801\uBB3C'
};

const normalizeDefectValue = value => String(value || '')
  .toLocaleLowerCase()
  .replace(/[\s()[\]{}_\-.,:;/'"]/g, '');

const UNCLASSIFIABLE_DEFECT_MARKERS = [
  'commonagentdiagnosis',
  'unknown',
  'unclassified',
  '\uD310\uC815\uBD88\uAC00',
  '\uBD84\uB958\uBD88\uAC00',
  '\uBBF8\uD310\uC815',
  '\uBBF8\uC815',
  '\uBD88\uBD84\uBA85',
  '\uD655\uC778\uBD88\uAC00',
  '\uC815\uC0C1\uD615\uC0C1',
  '\uC774\uC0C1\uC5C6\uC74C',
  '\uACB0\uD568\uC5C6\uC74C',
  '\uACB0\uD568\uBBF8\uD655\uC778'
];

const isClassifiableDefectLabel = value => {
  const raw = String(value || '').trim();
  const normalized = normalizeDefectValue(raw);
  if (!normalized || raw === '-') return false;
  return !UNCLASSIFIABLE_DEFECT_MARKERS.some(marker =>
    normalized.includes(normalizeDefectValue(marker))
  );
};

const canonicalDefectClass = value => {
  const normalized = normalizeDefectValue(value);
  if (!normalized) return 'unclassified';
  const matched = DEFECT_CLASS_ALIASES.find(([, aliases]) =>
    aliases.some(alias => normalized.includes(normalizeDefectValue(alias)))
  );
  return matched?.[0] || `other:${normalized}`;
};

module.exports = {
  DEFECT_CLASS_ALIASES,
  DEFECT_CLASS_LABELS,
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass,
  isClassifiableDefectLabel,
  normalizeDefectValue
};
