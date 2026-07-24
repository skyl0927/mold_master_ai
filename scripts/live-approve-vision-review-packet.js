const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalDefectClass } = require('../shared/defect-taxonomy');
const {
  validateVisionHitlAuthorization
} = require('../visionHitlAuthorization');

const root = path.resolve(__dirname, '..');
const artifactRoot = path.join(root, 'artifacts');
const agentUrl = String(
  process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');
const qaUrl = String(
  process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103'
).replace(/\/+$/, '');

const argumentValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const authorizationPath = path.resolve(
  argumentValue('--authorization')
  || process.env.MOLD_MASTER_HITL_AUTHORIZATION_FILE
  || ''
);
if (
  !argumentValue('--authorization')
  && !process.env.MOLD_MASTER_HITL_AUTHORIZATION_FILE
) {
  throw new Error(
    'Live HITL approval requires --authorization <reviewed-json>. '
    + 'Generate a template with npm run vision:hitl:prepare.'
  );
}
if (!fs.existsSync(authorizationPath)) {
  throw new Error(`Vision HITL authorization file was not found: ${authorizationPath}`);
}

const authorization = JSON.parse(fs.readFileSync(authorizationPath, 'utf8'));
const packetRoot = path.resolve(String(authorization.packetRoot || ''));
const manifestPath = path.join(packetRoot, 'vision-candidates.json');
if (!authorization.packetRoot || !fs.existsSync(manifestPath)) {
  throw new Error('The authorization packetRoot does not contain vision-candidates.json.');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const fetchDataset = async () => {
  const response = await fetch(
    `${agentUrl}/v1/datasets/images?include_hidden=true&limit=500`
  );
  if (!response.ok) {
    throw new Error(`Common Agent dataset query failed: ${response.status}`);
  }
  return response.json();
};

const itemHash = item => String(item?.metadata?.content_sha256 || '')
  .trim()
  .toLowerCase();

const approvedHashes = dataset => new Set(
  (dataset.items || [])
    .filter(item => item.review_status === 'approved')
    .map(itemHash)
    .filter(Boolean)
);

const waitForApprovedHash = async (target, timeoutMs = 120000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dataset = await fetchDataset();
    const match = (dataset.items || []).find(item =>
      itemHash(item) === target.contentSha256
      && item.review_status === 'approved'
      && canonicalDefectClass(item.defect_type) === target.defectClass
    );
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for approved hash: ${target.contentSha256}`);
};

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const profilePath = path.join(artifactRoot, `live-hitl-approval-profile-${runId}`);
const auditPath = path.join(artifactRoot, `live-hitl-approval-${runId}.json`);
const audit = {
  schemaVersion: 2,
  startedAt: new Date().toISOString(),
  authorizationPath,
  packetRoot,
  agentUrl,
  qaUrl,
  results: [],
  requests: [],
  completed: false
};

const writeAudit = () => {
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
};

const run = async () => {
  writeAudit();
  const beforeDataset = await fetchDataset();
  const validated = validateVisionHitlAuthorization({
    authorization,
    manifest,
    datasetItems: beforeDataset.items || []
  });
  audit.authorization = {
    authorizationId: validated.authorizationId,
    authorizedBy: validated.authorizedBy,
    authorizedAt: validated.authorizedAt,
    packetDigest: validated.packetDigest,
    targets: validated.targets
  };
  writeAudit();

  const beforeApproved = approvedHashes(beforeDataset);
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const launchOptions = {
    args: executablePath
      ? [`--user-data-dir=${profilePath}`]
      : ['.', `--user-data-dir=${profilePath}`],
    cwd: root,
    env: {
      ...process.env,
      MOLD_MASTER_VISION_REVIEW_PACKET_ROOT: packetRoot
    }
  };
  let app;
  try {
    app = await electron.launch(executablePath
      ? { ...launchOptions, executablePath: path.resolve(executablePath) }
      : launchOptions);
    const page = await app.firstWindow();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', request => {
      const url = request.url();
      if (
        url.startsWith(agentUrl)
        && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      ) {
        audit.requests.push({ method: request.method(), url });
        writeAudit();
      }
    });

    await page.evaluate(async config => {
      await window.electronAPI.setApiConfig(config);
    }, {
      provider: 'openai',
      aiOrchestrationMode: 'common_agent_primary',
      agentServerUrl: agentUrl,
      visionQaServerUrl: qaUrl,
      shortcut: 'CommandOrControl+Shift+C'
    });

    await page.getByText('DATABASE TREE').click();
    await page.getByTestId('dataset-tab-common-agent').click();
    await page.getByTestId('scan-prepared-vision-packet').click();
    if (validated.targets.some(target => !target.alreadyApproved)) {
      await page.getByLabel(
        `${validated.targets.find(target => !target.alreadyApproved).candidateId} local defect label`
      ).waitFor({ timeout: 30000 });
    }

    for (const target of validated.targets) {
      audit.currentTarget = target.contentSha256;
      writeAudit();
      if (target.alreadyApproved) {
        audit.results.push({
          ...target,
          status: 'already_approved',
          completedAt: new Date().toISOString()
        });
        delete audit.currentTarget;
        writeAudit();
        continue;
      }

      const labelInput = page.getByLabel(`${target.candidateId} local defect label`);
      await labelInput.waitFor({ timeout: 30000 });
      const currentLabel = String(await labelInput.inputValue()).trim();
      if (canonicalDefectClass(currentLabel) !== target.defectClass) {
        throw new Error(
          `UI label mismatch for ${target.fileName}: ${currentLabel} != ${target.defectType}`
        );
      }
      const reconciliation = page.getByLabel(`${target.candidateId} label reconciliation`);
      if (await reconciliation.count()) await reconciliation.check();
      const manufacturingConfirmation = page.getByTestId(
        `${target.candidateId}-manufacturing-image-confirmation`
      );
      if (await manufacturingConfirmation.count()) {
        await manufacturingConfirmation.check();
      }
      await page.getByTestId(
        `${target.candidateId}-human-approval-confirmation`
      ).check();
      await page.getByTestId(`${target.candidateId}-approve-and-promote`).click();

      const approvedItem = await waitForApprovedHash(target);
      audit.results.push({
        ...target,
        imageId: approvedItem.image_id,
        reviewStatus: approvedItem.review_status,
        status: 'approved_and_promoted',
        completedAt: new Date().toISOString()
      });
      delete audit.currentTarget;
      writeAudit();
    }

    const afterDataset = await fetchDataset();
    const afterApproved = approvedHashes(afterDataset);
    const newlyApproved = [...afterApproved].filter(hash => !beforeApproved.has(hash));
    const targetHashes = new Set(
      validated.targets
        .filter(target => !target.alreadyApproved)
        .map(target => target.contentSha256)
    );
    const unexpectedApproved = newlyApproved.filter(hash => !targetHashes.has(hash));
    if (unexpectedApproved.length > 0) {
      throw new Error(
        `Unexpected approved image hashes were observed: ${unexpectedApproved.join(', ')}`
      );
    }
    audit.consoleErrors = consoleErrors;
    audit.newlyApprovedHashes = newlyApproved;
    if (consoleErrors.length > 0) {
      throw new Error(`Renderer console errors: ${consoleErrors.join(' | ')}`);
    }
    audit.completed = true;
    audit.completedAt = new Date().toISOString();
    writeAudit();
    console.log(JSON.stringify({
      auditPath,
      authorizationId: validated.authorizationId,
      approved: audit.results.filter(item =>
        item.status === 'approved_and_promoted'
      ).length,
      alreadyApproved: audit.results.filter(item =>
        item.status === 'already_approved'
      ).length,
      writeRequests: audit.requests.length,
      consoleErrors
    }, null, 2));
  } finally {
    if (app) await app.close();
  }
};

run().catch(error => {
  audit.error = error instanceof Error ? error.message : String(error);
  audit.failedAt = new Date().toISOString();
  writeAudit();
  console.error(error);
  process.exitCode = 1;
});
