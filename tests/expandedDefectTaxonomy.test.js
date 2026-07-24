const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFECT_CLASS_LABELS,
  REQUIRED_DEFECT_CLASSES,
  canonicalDefectClass
} = require('../shared/defect-taxonomy');

const EXTENDED_CASES = [
  ['박리', 'delamination'],
  ['제팅', 'jetting'],
  ['광택 불균일', 'gloss_variation'],
  ['콜드 슬러그', 'cold_slug'],
  ['공기 갇힘', 'air_trap'],
  ['보이드', 'void'],
  ['무광 반점', 'dull_spot'],
  ['유동 자국', 'flow_mark'],
  ['착색 줄무늬', 'color_streak'],
  ['은줄/수분 줄무늬', 'silver_streak'],
  ['보강재 줄무늬', 'reinforcement_streak'],
  ['타이거 라인', 'tiger_stripe'],
  ['응력 균열', 'stress_crack'],
  ['미용융 수지', 'unmelted_material'],
  ['변형/휨', 'warpage'],
  ['금형 퇴적물', 'mold_deposit']
];

test('extended injection-molding defect names map to stable graph taxonomy classes', () => {
  for (const [label, defectClass] of EXTENDED_CASES) {
    assert.equal(canonicalDefectClass(label), defectClass);
    assert.equal(typeof DEFECT_CLASS_LABELS[defectClass], 'string');
  }
});

test('extended graph taxonomy does not change the seven-class Vision gate', () => {
  assert.deepEqual(REQUIRED_DEFECT_CLASSES, [
    'whitening',
    'short_shot',
    'burn',
    'flash',
    'sink',
    'weld_line',
    'ejection'
  ]);
});
