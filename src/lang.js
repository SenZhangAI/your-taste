import { readFile, writeFile, mkdir } from 'fs/promises';
import { debug } from './debug.js';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getLangPath() {
  return `${getDir()}/.lang`;
}

/**
 * Read the user's preferred language. Returns 'en' if not set.
 */
export async function readLang() {
  try {
    const lang = (await readFile(getLangPath(), 'utf8')).trim();
    return lang || 'en';
  } catch {
    return 'en';
  }
}

/**
 * Write the user's preferred language.
 */
export async function writeLang(lang) {
  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getLangPath(), lang.trim(), 'utf8');
  debug(`lang: set to ${lang}`);
}

/**
 * Check if a language preference file exists.
 */
export async function hasLangFile() {
  try {
    await readFile(getLangPath(), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full language name for prompt injection.
 */
const LANGUAGE_NAMES = {
  zh: 'Chinese (简体中文)',
  en: 'English',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  pt: 'Portuguese (Português)',
  ru: 'Russian (Русский)',
};

export function languageName(code) {
  return LANGUAGE_NAMES[code] || code;
}

/**
 * Markdown template strings by language.
 * Only covers section headers and structural text — dynamic content comes from LLM.
 */
const TEMPLATES = {
  en: {
    // global-context.js
    globalContextHeader: '# Cross-Project Focus',
    globalContextInjection: '### Cross-Project Focus',
    // context.js
    contextHeader: '# Project Context',
    contextDecisions: '## Recent Decisions',
    contextQuestions: '## Open Questions',
    contextLastSession: '## Last Session',
    // observations.js (legacy, kept for backward compat reading)
    thinkingPatternsHeader: 'Thinking Patterns',
    behavioralPatternsHeader: 'Behavioral Patterns',
    workingPrinciplesHeader: 'Working Principles',
    suggestedRulesHeader: 'Suggested Rules',
    commonMisreadsHeader: 'Common Misreads',
    // observations.js (v1.0 thinking framework)
    reasoningCheckpointsHeader: 'Reasoning Checkpoints',
    domainReasoningHeader: 'Domain Reasoning',
    failurePatternsHeader: 'Failure Patterns',
  },
  zh: {
    globalContextHeader: '# 跨项目关注方向',
    globalContextInjection: '### 跨项目关注方向',
    contextHeader: '# 项目上下文',
    contextDecisions: '## 近期决策',
    contextQuestions: '## 待解决问题',
    contextLastSession: '## 上次会话',
    thinkingPatternsHeader: '思维模式',
    behavioralPatternsHeader: '行为模式',
    workingPrinciplesHeader: '工作原则',
    suggestedRulesHeader: '建议规则',
    commonMisreadsHeader: '常见误读',
    reasoningCheckpointsHeader: '推理检查点',
    domainReasoningHeader: '领域推理',
    failurePatternsHeader: '失败模式',
  },
  ja: {
    globalContextHeader: '# クロスプロジェクト フォーカス',
    globalContextInjection: '### クロスプロジェクト フォーカス',
    contextHeader: '# プロジェクトコンテキスト',
    contextDecisions: '## 最近の決定',
    contextQuestions: '## 未解決の質問',
    contextLastSession: '## 前回のセッション',
    thinkingPatternsHeader: 'Thinking Patterns',
    behavioralPatternsHeader: 'Behavioral Patterns',
    workingPrinciplesHeader: 'Working Principles',
    suggestedRulesHeader: 'Suggested Rules',
    commonMisreadsHeader: 'Common Misreads',
    reasoningCheckpointsHeader: 'Reasoning Checkpoints',
    domainReasoningHeader: 'Domain Reasoning',
    failurePatternsHeader: 'Failure Patterns',
  },
};

/**
 * Get template strings for a language. Falls back to English.
 */
export function getTemplates(lang) {
  return TEMPLATES[lang] || TEMPLATES.en;
}
