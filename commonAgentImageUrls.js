async function loadImageUrls(items, getUrl) {
  let cursor = 0;
  const urls = {};
  const failures = [];
  async function worker() {
    while (cursor < items.length) {
      const id = items[cursor++].image_id;
      try { urls[id] = await getUrl(id); }
      catch { failures.push(id); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  return { urls, failures };
}

function releaseImageUrls(urls, revoke = url => URL.revokeObjectURL(url)) {
  for (const url of Object.values(urls)) if (typeof url === 'string' && url.startsWith('blob:')) revoke(url);
}

module.exports = { loadImageUrls, releaseImageUrls };
