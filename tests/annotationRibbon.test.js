const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ANNOTATION_RIBBON_GROUPS,
  ANNOTATION_RIBBON_TABS
} = require('../annotationRibbon');

test('organizes annotation commands into Office-style functional tabs', () => {
  assert.deepEqual(
    ANNOTATION_RIBBON_TABS.map(tab => [tab.id, tab.labelKo]),
    [
      ['home', '홈'],
      ['annotate', '주석'],
      ['measure', '측정'],
      ['format', '서식'],
      ['translate', '번역']
    ]
  );
  assert.deepEqual(
    ANNOTATION_RIBBON_GROUPS.measure.flatMap(group => group.commands),
    ['calibration', 'perspective-calibration', 'dimension', 'angle', 'measurement-review']
  );
});

test('assigns each ribbon command to exactly one functional group', () => {
  const commands = Object.values(ANNOTATION_RIBBON_GROUPS)
    .flatMap(groups => groups)
    .flatMap(group => group.commands);
  assert.equal(new Set(commands).size, commands.length);
  assert.ok(commands.includes('save'));
  assert.ok(commands.includes('translate'));
  assert.ok(commands.includes('angle'));
});
