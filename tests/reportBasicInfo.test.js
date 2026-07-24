const assert = require('node:assert/strict');
const test = require('node:test');

const { createInitialReportBasicInfo } = require('../reportBasicInfo');

test('only date fields receive a generated default value', () => {
    const fields = [
        { key: 'jobNo', type: 'text', default: '24M1140Z' },
        { key: 'customer', type: 'text', default: 'DEC' },
        { key: 'author', type: 'text', default: '이성희' },
        { key: 'writeDate', type: 'date' },
        { key: 'reviewDate', type: 'date', default: '2020-01-01' },
        { key: 'reviewContent', type: 'textarea', default: '고정 검토 내용' }
    ];

    const result = createInitialReportBasicInfo(fields, '2026-07-24');

    assert.deepEqual(result, {
        jobNo: '',
        customer: '',
        author: '',
        writeDate: '2026-07-24',
        reviewDate: '2026-07-24',
        reviewContent: ''
    });
});

test('missing or malformed field definitions produce a safe empty object', () => {
    assert.deepEqual(createInitialReportBasicInfo(null, '2026-07-24'), {});
    assert.deepEqual(createInitialReportBasicInfo([{ type: 'text' }], '2026-07-24'), {});
});
