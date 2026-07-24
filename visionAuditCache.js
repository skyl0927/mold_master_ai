const fs = require('node:fs');
const path = require('node:path');

const SHA256 = /^[a-f0-9]{64}$/i;

const loadReusableVisionAuditItems = ({
  artifactRoot,
  excludePacketRoot
} = {}) => {
  const cache = new Map();
  if (!artifactRoot || !fs.existsSync(artifactRoot)) return cache;
  const excluded = excludePacketRoot ? path.resolve(excludePacketRoot) : '';
  const audits = fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry =>
      entry.isDirectory()
      && entry.name.startsWith('vision-human-review-packet-')
    )
    .map(entry => path.resolve(artifactRoot, entry.name))
    .filter(packetRoot => packetRoot !== excluded)
    .map(packetRoot => ({
      packetRoot,
      auditPath: path.join(packetRoot, 'vision-audit.json')
    }))
    .filter(item => fs.existsSync(item.auditPath))
    .flatMap(item => {
      try {
        const payload = JSON.parse(fs.readFileSync(item.auditPath, 'utf8'));
        return [{
          ...item,
          generatedAt: String(payload.generatedAt || ''),
          items: Array.isArray(payload.items) ? payload.items : []
        }];
      } catch {
        return [];
      }
    })
    .sort((left, right) =>
      left.generatedAt.localeCompare(right.generatedAt)
      || left.packetRoot.localeCompare(right.packetRoot)
    );

  for (const audit of audits) {
    for (const item of audit.items) {
      const contentSha256 = String(item?.contentSha256 || '').trim().toLowerCase();
      if (
        !SHA256.test(contentSha256)
        || item?.status !== 'completed'
        || !item?.observation
      ) {
        continue;
      }
      cache.set(contentSha256, {
        ...item,
        contentSha256,
        sourceAuditPath: audit.auditPath
      });
    }
  }
  return cache;
};

module.exports = {
  loadReusableVisionAuditItems
};
