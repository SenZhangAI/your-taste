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
    // taste-file.js
    tasteHeader: '# Your Taste',
    // global-context.js
    globalContextHeader: '# Cross-Project Focus',
    globalContextInjection: '### Cross-Project Focus',
    // goal.js
    goalHeader: '# Project Goal',
    goalWhat: '## What',
    goalWhatDesc: 'What is this project? One paragraph describing the core purpose.',
    goalConstraints: '## Constraints',
    goalConstraintsDesc: 'Non-negotiable boundaries (tech stack, performance requirements, compatibility).',
    goalArchDecisions: '## Architecture Decisions',
    goalArchDesc: 'Key technical decisions and WHY they were made.',
    goalRejected: '## Rejected Approaches',
    goalRejectedDesc: 'Approaches considered and rejected, with reasons.',
    // context.js
    contextHeader: '# Project Context',
    contextDecisions: '## Recent Decisions',
    contextQuestions: '## Open Questions',
    contextLastSession: '## Last Session',
  },
  zh: {
    tasteHeader: '# 你的品味',
    globalContextHeader: '# 跨项目关注方向',
    globalContextInjection: '### 跨项目关注方向',
    goalHeader: '# 项目目标',
    goalWhat: '## 是什么',
    goalWhatDesc: '这个项目是什么？用一段话描述核心目的。',
    goalConstraints: '## 约束条件',
    goalConstraintsDesc: '不可妥协的边界（技术栈、性能要求、兼容性）。',
    goalArchDecisions: '## 架构决策',
    goalArchDesc: '关键技术决策及其原因。',
    goalRejected: '## 否决方案',
    goalRejectedDesc: '考虑过但否决的方案，附原因。',
    contextHeader: '# 项目上下文',
    contextDecisions: '## 近期决策',
    contextQuestions: '## 待解决问题',
    contextLastSession: '## 上次会话',
  },
  ja: {
    tasteHeader: '# あなたのテイスト',
    globalContextHeader: '# クロスプロジェクト フォーカス',
    globalContextInjection: '### クロスプロジェクト フォーカス',
    goalHeader: '# プロジェクト目標',
    goalWhat: '## 概要',
    goalWhatDesc: 'このプロジェクトは何ですか？核心的な目的を一段落で説明してください。',
    goalConstraints: '## 制約条件',
    goalConstraintsDesc: '妥協できない境界（技術スタック、パフォーマンス要件、互換性）。',
    goalArchDecisions: '## アーキテクチャ決定',
    goalArchDesc: '重要な技術的決定とその理由。',
    goalRejected: '## 却下されたアプローチ',
    goalRejectedDesc: '検討したが却下したアプローチとその理由。',
    contextHeader: '# プロジェクトコンテキスト',
    contextDecisions: '## 最近の決定',
    contextQuestions: '## 未解決の質問',
    contextLastSession: '## 前回のセッション',
  },
};

/**
 * Get template strings for a language. Falls back to English.
 */
export function getTemplates(lang) {
  return TEMPLATES[lang] || TEMPLATES.en;
}
