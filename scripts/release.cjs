const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function sh(cmd, { cwd } = {}) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function shInherit(cmd, { cwd } = {}) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function parseVersion(v) {
  const m = String(v).trim().match(/^([0-9]+)\.([0-9]+)\.([0-9]+)$/);
  if (!m) {
    throw new Error(`Invalid version '${v}'. Expected format: X.Y.Z`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bumpVersion(v, bumpType) {
  const { major, minor, patch } = parseVersion(v);
  if (bumpType === 'major') return `${major + 1}.0.0`;
  if (bumpType === 'minor') return `${major}.${minor + 1}.0`;
  if (bumpType === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump type '${bumpType}'. Use: patch|minor|major`);
}

function ensureCleanGitTree(root) {
  const status = sh('git status --porcelain', { cwd: root });
  if (status) {
    throw new Error('Working tree is not clean. Commit or stash changes before running make push.');
  }
}

function getLatestTag(root) {
  try {
    const out = sh('git tag --list "v*" --sort=-version:refname | head -n 1', { cwd: root });
    return out || null;
  } catch {
    return null;
  }
}

function updateJsonVersion(filePath, nextVersion) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  const obj = JSON.parse(raw);
  obj.version = nextVersion;
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  const root = path.resolve(__dirname, '..');

  const bumpType = process.env.BUMP || process.argv[2] || 'patch';

  const versionFile = path.join(root, 'VERSION');
  if (!fs.existsSync(versionFile)) {
    throw new Error('Missing VERSION file in repo root. Create it e.g. with: echo 0.1.0 > VERSION');
  }

  ensureCleanGitTree(root);

  const current = fs.readFileSync(versionFile, 'utf8').trim();
  const next = bumpVersion(current, bumpType);
  const tag = `v${next}`;

  const existingTags = sh('git tag --list', { cwd: root }).split(/\r?\n/).filter(Boolean);
  if (existingTags.includes(tag)) {
    throw new Error(`Tag '${tag}' already exists.`);
  }

  const prevTag = getLatestTag(root);
  const range = prevTag ? `${prevTag}..HEAD` : null;

  let changes = '';
  try {
    const cmd = range
      ? `git log ${range} --pretty=format:"- %s (%h)"`
      : `git log --pretty=format:"- %s (%h)"`;
    changes = sh(cmd, { cwd: root });
  } catch {
    changes = '';
  }

  const docsDir = path.join(root, 'docs', 'v', tag);
  fs.mkdirSync(docsDir, { recursive: true });

  const now = new Date().toISOString();
  const changelogMd = `# ${tag}\n\nGenerated on: ${now}\n\n## Changes\n\n${changes || '- Initial release'}\n`;
  fs.writeFileSync(path.join(docsDir, 'changelog.md'), changelogMd);

  const todoMd = `# ${tag} TODO\n\n- [ ] Review generated changelog\n- [ ] Add missing items\n- [ ] Verify release artifacts\n`;
  fs.writeFileSync(path.join(docsDir, 'todo.md'), todoMd);

  fs.writeFileSync(versionFile, `${next}\n`);

  const exefPkg = path.join(root, 'exef', 'package.json');
  updateJsonVersion(exefPkg, next);

  shInherit('git add VERSION', { cwd: root });
  shInherit(`git add docs/v/${tag}`, { cwd: root });
  if (fs.existsSync(exefPkg)) {
    shInherit('git add exef/package.json', { cwd: root });
  }

  shInherit(`git commit -m "chore(release): ${tag}"`, { cwd: root });
  shInherit(`git tag -a ${tag} -m "${tag}"`, { cwd: root });
  shInherit('git push --follow-tags', { cwd: root });

  process.stdout.write(`\nRelease complete: ${tag}\n`);
  process.stdout.write(`Docs: docs/v/${tag}/changelog.md\n`);
}

main();
