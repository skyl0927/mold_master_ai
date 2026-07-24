const assert = require('node:assert/strict');
const test = require('node:test');

const { createCaptureFrameCache } = require('../captureFrameCache');

test('a second capture refresh replaces the first desktop frame', async () => {
    const cache = createCaptureFrameCache();
    let captureNumber = 0;
    const captureDesktop = async () => {
        captureNumber += 1;
        return [{
            id: `source-${captureNumber}`,
            display: { id: 'display-1' },
            thumbnail: `frame-${captureNumber}`
        }];
    };

    await cache.refresh(captureDesktop);
    assert.equal(cache.getForDisplay('display-1').thumbnail, 'frame-1');

    await cache.refresh(captureDesktop);
    assert.equal(cache.getForDisplay('display-1').thumbnail, 'frame-2');
    assert.equal(cache.all().length, 1);
    assert.equal(captureNumber, 2);
});

test('refresh invalidates the previous frame before asynchronous capture completes', async () => {
    const cache = createCaptureFrameCache();
    await cache.refresh(async () => [{
        id: 'source-old',
        display: { id: 'display-1' },
        thumbnail: 'old-frame'
    }]);

    let release;
    const pending = cache.refresh(() => new Promise(resolve => {
        release = resolve;
    }));

    assert.equal(cache.getForDisplay('display-1'), undefined);
    release([{
        id: 'source-new',
        display: { id: 'display-1' },
        thumbnail: 'new-frame'
    }]);
    await pending;
    assert.equal(cache.getForDisplay('display-1').thumbnail, 'new-frame');
});

test('an older concurrent refresh cannot overwrite a newer frame', async () => {
    const cache = createCaptureFrameCache();
    let releaseOld;
    const oldRefresh = cache.refresh(() => new Promise(resolve => {
        releaseOld = resolve;
    }));
    const newRefresh = cache.refresh(async () => [{
        id: 'source-new',
        display: { id: 'display-1' },
        thumbnail: 'new-frame'
    }]);

    await newRefresh;
    releaseOld([{
        id: 'source-old',
        display: { id: 'display-1' },
        thumbnail: 'old-frame'
    }]);
    await oldRefresh;

    assert.equal(cache.getForDisplay('display-1').thumbnail, 'new-frame');
});

test('clear removes captured pixels after completion or cancellation', async () => {
    const cache = createCaptureFrameCache();
    await cache.refresh(async () => [{
        id: 'source-1',
        display: { id: 'display-1' },
        thumbnail: 'frame-1'
    }]);

    cache.clear();

    assert.equal(cache.getForDisplay('display-1'), undefined);
    assert.deepEqual(cache.all(), []);
});
