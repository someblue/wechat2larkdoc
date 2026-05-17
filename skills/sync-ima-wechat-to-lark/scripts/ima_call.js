const fs = require('fs');
const path = require('path');
const os = require('os');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

function resolveImaSkillDir() {
  if (process.env.IMA_SKILL_DIR) {
    return process.env.IMA_SKILL_DIR;
  }
  return path.join(os.homedir(), '.hermes', 'skills', 'productivity', 'ima-skill');
}

function readCredentials() {
  const clientId = process.env.IMA_OPENAPI_CLIENTID || readText(path.join(os.homedir(), '.config', 'ima', 'client_id'));
  const apiKey = process.env.IMA_OPENAPI_APIKEY || readText(path.join(os.homedir(), '.config', 'ima', 'api_key'));
  return { clientId, apiKey };
}

async function main() {
  const apiPath = process.argv[2];
  const rawBody = process.argv[3] || '{}';

  if (!apiPath) {
    throw new Error('Usage: node ima_call.js <api_path> <json_body>');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    throw new Error(`Invalid JSON body: ${error.message}`);
  }

  const skillDir = resolveImaSkillDir();
  const apiModulePath = path.join(skillDir, 'ima_api.cjs');
  const { imaApi } = require(apiModulePath);
  const credentials = readCredentials();
  const response = await imaApi(apiPath, body, credentials);
  process.stdout.write(response);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
