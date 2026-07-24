const fs = require('fs');
const path = require('path');

const KNOWLEDGE_PATH = path.join(__dirname, '..', 'data', 'generated', 'process-matrix-knowledge.json');

const normalize = (value) => (value || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();

const tokenize = (value) => {
  return normalize(value)
    .split(/[^0-9a-zA-Z가-힣]+/u)
    .filter(Boolean);
};

const splitItems = (value) => {
  const normalized = (value || '').toString().replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
  if (!normalized) return [];
  return normalized
    .split(/(?=[ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ①②③④⑤⑥⑦⑧⑨⑩])/u)
    .map((item) => item.trim())
    .filter(Boolean);
};

const scoreText = (query, text, weight = 1) => {
  if (!text) return 0;
  const normalizedQuery = normalize(query);
  const normalizedText = normalize(text);
  const queryTokens = tokenize(query);
  let score = 0;

  for (const token of queryTokens) {
    if (normalizedText === token) score += 5 * weight;
    else if (normalizedText.includes(token)) score += 2 * weight;
  }

  if (normalizedQuery && normalizedText && normalizedQuery.includes(normalizedText)) score += 3 * weight;
  if (normalizedQuery && normalizedText && normalizedText.includes(normalizedQuery)) score += 4 * weight;

  return score;
};

const buildCauseCandidates = (record, query) => {
  return [
    ['design', record.designChecks],
    ['machining', record.machiningChecks],
    ['assembly', record.assemblyChecks],
    ['measurement', record.measurementChecks],
    ['trial', record.trialChecks]
  ]
    .flatMap(([stage, value]) => splitItems(value).map((text) => ({
      stage,
      text,
      score: scoreText(query, text, 2.5)
    })))
    .sort((a, b) => b.score - a.score);
};

const buildActionCandidates = (record, query) => {
  return splitItems(record.commonActions)
    .map((text) => ({
      text,
      score: scoreText(query, text, 2.5)
    }))
    .sort((a, b) => b.score - a.score);
};

const stageLabel = (stage) => ({
  design: '설계',
  machining: '가공',
  assembly: '조립',
  measurement: '측정',
  trial: '시사출'
}[stage] || stage);

function rankPaths(records, query, topK = 5) {
  const signals = {
    whitening: /백화/.test(query),
    ejection: /(취출|튀기|튕기|딱|소리)/.test(query),
    sticking: /(물림|스티킹|래핑|구배|밸런스)/.test(query),
    normalCondition: /(정상 범위|정상법위|정상범위)/.test(query) && /(사출 조건|사출조건|압력|보압|배압)/.test(query)
  };

  const applyBias = (score, record, cause, action) => {
    const combinedText = [
      record.issueFamily,
      record.issueName,
      cause?.text || '',
      action?.text || ''
    ].join(' ');

    if (signals.whitening && /백화/.test(combinedText)) score += 10;
    if (signals.ejection && /(취출|물림|스티킹|튀출|튀기|튕기)/.test(combinedText)) score += 14;
    if (signals.sticking && /(물림|스티킹|래핑|구배|밸런스)/.test(combinedText)) score += 10;
    if (signals.normalCondition && /(사출 압력|보압|배압|압력,보압,배압 조정|압력 조정)/.test(combinedText)) score -= 12;
    return score;
  };

  const ranked = [];

  for (const record of records) {
    const issueScore =
      scoreText(query, record.issueName, 3) +
      scoreText(query, record.issueFamily, 2) +
      scoreText(query, record.processGroup, 1.5) +
      scoreText(query, record.productGroup, 1);

    const causes = buildCauseCandidates(record, query).filter((item) => item.score > 0).slice(0, 2);
    const actions = buildActionCandidates(record, query).filter((item) => item.score > 0).slice(0, 2);

    if (issueScore <= 0 && causes.length === 0 && actions.length === 0) continue;

    if (causes.length === 0 && actions.length === 0) {
      ranked.push({ record, issueScore, score: applyBias(issueScore, record) });
      continue;
    }

    if (causes.length > 0 && actions.length === 0) {
      for (const cause of causes) {
        ranked.push({ record, issueScore, cause, score: applyBias(issueScore * 2 + cause.score * 2.5 + 1, record, cause) });
      }
      continue;
    }

    if (causes.length === 0 && actions.length > 0) {
      for (const action of actions) {
        ranked.push({ record, issueScore, action, score: applyBias(issueScore * 2 + action.score * 2.5 + 1, record, undefined, action) });
      }
      continue;
    }

    for (const cause of causes) {
      for (const action of actions) {
        ranked.push({
          record,
          issueScore,
          cause,
          action,
          score: applyBias(issueScore * 2 + cause.score * 2.5 + action.score * 2.2 + 4, record, cause, action)
        });
      }
    }
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, topK);
}

function main() {
  if (!fs.existsSync(KNOWLEDGE_PATH)) {
    throw new Error(`Knowledge file not found: ${KNOWLEDGE_PATH}`);
  }

  const query = process.argv.slice(2).join(' ').trim() || '리브 두께 수축 자국 대책';
  const raw = fs.readFileSync(KNOWLEDGE_PATH, 'utf8').replace(/^\uFEFF/, '');
  const records = JSON.parse(raw);
  const ranked = rankPaths(records, query, 5);

  console.log(`Query: ${query}`);
  console.log(`Knowledge Source: ${KNOWLEDGE_PATH}`);
  console.log('');

  if (ranked.length === 0) {
    console.log('No ranked path found.');
    return;
  }

  const top = ranked[0];
  console.log('Answer:');
  console.log(
    `질의어 "${query}"는 ${top.record.productGroup} / ${top.record.processGroup} / ${top.record.issueFamily}의 ` +
    `"${top.record.issueName}" 이슈와 가장 가깝게 매칭되었습니다. ` +
    `${top.cause ? `직접 매칭된 원인/검증 노드는 ${top.cause.text} 이고, ` : ''}` +
    `${top.action ? `직접 매칭된 대책 노드는 ${top.action.text} 입니다.` : '대책 노드는 공통 조치 텍스트를 추가 학습하면 더 정밀해집니다.'}`
  );
  console.log('');
  console.log('Reasoning Trace:');
  console.log(`1. 제품군/공정/이슈명뿐 아니라 설계·가공·조립·측정·시사출 체크 텍스트까지 함께 점수화했습니다.`);
  console.log(`2. 원인/검증 텍스트와 대책 텍스트를 별도 노드처럼 직접 매칭했습니다.`);
  console.log(`3. issue -> cause/check -> action 경로를 multi-hop으로 랭킹해 최상위 경로를 선택했습니다.`);
  console.log('');
  console.log('Top Paths:');
  ranked.forEach((item, index) => {
    const segments = [
      item.record.productGroup,
      item.record.processGroup,
      item.record.issueFamily,
      item.record.issueName
    ];
    if (item.cause) segments.push(`${stageLabel(item.cause.stage)}:${item.cause.text}`);
    if (item.action) segments.push(`대책:${item.action.text}`);
    console.log(`${index + 1}. score=${item.score.toFixed(1)} | ${segments.join(' -> ')}`);
  });
}

main();
