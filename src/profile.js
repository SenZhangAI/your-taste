import { readFile, writeFile, mkdir } from 'fs/promises';
import { parse, stringify } from 'yaml';
import { DIMENSIONS } from './dimensions.js';

function getProfileDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getProfilePath() {
  return `${getProfileDir()}/profile.yaml`;
}

export function createDefaultProfile() {
  const dimensions = {};
  for (const key of Object.keys(DIMENSIONS)) {
    dimensions[key] = {
      score: 0.5,
      confidence: 0,
      evidence_count: 0,
      last_updated: null,
      summary: null,
    };
  }
  return { version: 1, dimensions, observations: [] };
}

export async function readProfile() {
  try {
    const content = await readFile(getProfilePath(), 'utf8');
    return parse(content);
  } catch {
    return createDefaultProfile();
  }
}

export async function updateProfile(profile, signals) {
  for (const signal of signals) {
    const dim = profile.dimensions[signal.dimension];
    if (!dim) continue;

    // Bayesian update: each new evidence nudges the score
    const weight = 1 / (dim.evidence_count + 2);
    dim.score = dim.score * (1 - weight) + signal.score * weight;
    dim.evidence_count += 1;
    dim.confidence = Math.min(0.95, 1 - 1 / (dim.evidence_count + 1));
    dim.last_updated = new Date().toISOString().split('T')[0];
    if (signal.summary) dim.summary = signal.summary;
  }

  // Keep last 20 observations, newest first
  const newObs = signals.map(s => ({
    date: new Date().toISOString().split('T')[0],
    dimension: s.dimension,
    direction: s.direction,
    evidence: s.evidence,
  }));
  profile.observations = [...newObs, ...(profile.observations || [])].slice(0, 20);

  const dir = getProfileDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getProfilePath(), stringify(profile), 'utf8');
  return profile;
}
