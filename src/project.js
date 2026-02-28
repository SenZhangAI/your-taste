import { readFile, writeFile, mkdir } from 'fs/promises';
import { parse, stringify } from 'yaml';
import { basename, join } from 'path';
import { createHash } from 'crypto';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getProjectsDir() {
  return join(getDir(), 'projects');
}

function getIndexPath() {
  return join(getProjectsDir(), 'index.yaml');
}

export function getProjectName(projectPath) {
  // Strip trailing slash, take last component
  const cleaned = projectPath.replace(/\/+$/, '');
  return basename(cleaned);
}

export function getProjectDir(projectPath) {
  const name = getProjectName(projectPath);
  return join(getProjectsDir(), name);
}

async function loadIndex() {
  try {
    const content = await readFile(getIndexPath(), 'utf8');
    return parse(content) || {};
  } catch {
    return {};
  }
}

async function saveIndex(index) {
  await mkdir(getProjectsDir(), { recursive: true });
  await writeFile(getIndexPath(), stringify(index), 'utf8');
}

export async function ensureProjectDir(projectPath) {
  const name = getProjectName(projectPath);
  const index = await loadIndex();

  // Check if this exact project path is already indexed
  for (const [key, path] of Object.entries(index)) {
    if (path === projectPath) {
      const dir = join(getProjectsDir(), key);
      await mkdir(dir, { recursive: true });
      return dir;
    }
  }

  // New project — check for name collision
  let dirName = name;
  if (index[name] && index[name] !== projectPath) {
    // Name collision: append short hash of full path
    const hash = createHash('md5').update(projectPath).digest('hex').slice(0, 6);
    dirName = `${name}-${hash}`;
  }

  index[dirName] = projectPath;
  await saveIndex(index);

  const dir = join(getProjectsDir(), dirName);
  await mkdir(dir, { recursive: true });
  return dir;
}
