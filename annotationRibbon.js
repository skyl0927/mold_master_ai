const ANNOTATION_RIBBON_TABS = Object.freeze([
  { id: 'home', labelKo: '홈' },
  { id: 'annotate', labelKo: '주석' },
  { id: 'measure', labelKo: '측정' },
  { id: 'translate', labelKo: '번역' }
]);

const ANNOTATION_RIBBON_GROUPS = Object.freeze({
  home: [
    { id: 'file', labelKo: '파일', commands: ['save', 'cancel'] },
    { id: 'image', labelKo: '이미지', commands: ['crop', 'insert-image', 'whiteboard'] },
    { id: 'history', labelKo: '편집', commands: ['undo', 'redo'] }
  ],
  annotate: [
    { id: 'mark', labelKo: '표시', commands: ['pen', 'text', 'step', 'blur', 'eyedropper'] },
    { id: 'shape', labelKo: '도형', commands: ['arrow', 'line', 'rect', 'circle', 'ellipse', 'callout'] }
  ],
  measure: [
    { id: 'reference', labelKo: '실치수 기준', commands: ['calibration', 'perspective-calibration'] },
    { id: 'measurement', labelKo: '측정', commands: ['dimension', 'angle', 'measurement-review'] }
  ],
  translate: [
    { id: 'language', labelKo: '주석 번역', commands: ['translate'] }
  ]
});

const ANNOTATION_COMMON_GROUPS = Object.freeze([
  { id: 'selection', labelKo: '공통 도구', commands: ['select'] },
  { id: 'shape-style', labelKo: '공통 서식', commands: ['fill-style', 'line-style'] },
  { id: 'size', labelKo: '크기', commands: ['size'] },
  { id: 'color', labelKo: '색상', commands: ['color'] }
]);

module.exports = {
  ANNOTATION_COMMON_GROUPS,
  ANNOTATION_RIBBON_GROUPS,
  ANNOTATION_RIBBON_TABS
};
