const fs = require('node:fs/promises');
const path = require('node:path');
const RUNTIME_FILES = Object.freeze(['commonAgentTransport.js', 'commonAgentChildTransport.js',
  'shared/defect-taxonomy.js', 'visionCaptureProtocol.js']);

// extraResources excludes matching sources from app.asar; mirror only after packing.
async function mirrorCommonAgentRuntime({appOutDir}) {
  if (!path.isAbsolute(appOutDir)) throw new Error('Absolute package output directory required');
  const resources = path.join(appOutDir, 'resources');
  await fs.mkdir(resources, {recursive:true});
  await fs.writeFile(path.join(resources, 'package.json'), JSON.stringify({private:true, type:'commonjs'}) + '\n');
  for (const file of RUNTIME_FILES) {
    const target = path.join(resources, file);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.copyFile(path.join(__dirname, '..', file), target);
  }
}

module.exports = mirrorCommonAgentRuntime;
module.exports.RUNTIME_FILES = RUNTIME_FILES;
