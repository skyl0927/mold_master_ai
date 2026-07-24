const assert = require('node:assert/strict');
const test = require('node:test');

const {
  needsKoreanTranslation,
  translateWebKnowledgeDraft
} = require('../webKnowledgeKoreanTranslation');

test('translation detects English manufacturing text but preserves Korean text', () => {
  assert.equal(needsKoreanTranslation('Increase the melt temperature.'), true);
  assert.equal(needsKoreanTranslation('수지 온도를 높인다.'), false);
  assert.equal(needsKoreanTranslation(''), false);
});

test('translation inserts Korean text into every review field and deduplicates requests', async () => {
  const calls = [];
  const translations = new Map([
    ['Weld line', '웰드라인'],
    ['A visible line forms where melt fronts meet.', '유동 선단이 만나는 위치에 선이 나타난다.'],
    ['Two melt fronts meet.', '두 유동 선단이 만난다.'],
    ['Clean the venting channels.', '벤트 채널을 청소한다.']
  ]);
  const result = await translateWebKnowledgeDraft({
    defectName: 'Weld line',
    problem: '사출 성형품에 웰드라인이 발생한다.',
    phenomenon: 'A visible line forms where melt fronts meet.',
    causeCandidates: ['Two melt fronts meet.'],
    causeLabels: ['유동 선단'],
    checkItems: ['Clean the venting channels.'],
    actions: ['Clean the venting channels.']
  }, async text => {
    calls.push(text);
    return translations.get(text) || text;
  });

  assert.deepEqual(result, {
    defectName: '웰드라인',
    problem: '사출 성형품에 웰드라인이 발생한다.',
    phenomenon: '유동 선단이 만나는 위치에 선이 나타난다.',
    causeCandidates: ['두 유동 선단이 만난다.'],
    causeLabels: ['유동 선단'],
    checkItems: ['벤트 채널을 청소한다.'],
    actions: ['벤트 채널을 청소한다.']
  });
  assert.deepEqual(calls, [
    'Weld line',
    'A visible line forms where melt fronts meet.',
    'Two melt fronts meet.',
    'Clean the venting channels.'
  ]);
});

test('translation rejects empty model output instead of erasing source text', async () => {
  await assert.rejects(
    () => translateWebKnowledgeDraft({
      defectName: 'Flash',
      problem: '',
      phenomenon: '',
      causeCandidates: [],
      causeLabels: [],
      checkItems: [],
      actions: []
    }, async () => ''),
    /empty translation/i
  );
});
