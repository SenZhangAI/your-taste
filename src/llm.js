import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { parse } from 'yaml';
import { debug } from './debug.js';

const DEFAULT_TIMEOUT_MS = 90_000;

export const META_MARKER = '[YOUR-TASTE-ANALYSIS]';

// --- Provider Registry ---

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    apiFormat: 'anthropic-messages',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-4-5-20251001',
    baseUrl: 'https://api.anthropic.com',
  },
  openai: {
    name: 'OpenAI',
    apiFormat: 'openai-completions',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  deepseek: {
    name: 'DeepSeek',
    apiFormat: 'openai-completions',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
  },
  gemini: {
    name: 'Gemini',
    apiFormat: 'openai-completions',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  groq: {
    name: 'Groq',
    apiFormat: 'openai-completions',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  mistral: {
    name: 'Mistral',
    apiFormat: 'openai-completions',
    envKey: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest',
    baseUrl: 'https://api.mistral.ai/v1',
  },
  openrouter: {
    name: 'OpenRouter',
    apiFormat: 'openai-completions',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-haiku',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  'claude-cli-proxy': {
    name: 'Claude CLI Proxy',
    apiFormat: 'openai-completions',
    envKey: null, // uses Claude Code OAuth — must be explicitly configured
    defaultModel: 'claude-sonnet-4',
    baseUrl: 'http://localhost:3456/v1',
  },
  ollama: {
    name: 'Ollama',
    apiFormat: 'openai-completions',
    envKey: null, // no API key — must be explicitly configured
    defaultModel: 'llama3.2',
    baseUrl: 'http://localhost:11434/v1',
  },
};

const DETECT_ORDER = ['anthropic', 'openai', 'deepseek', 'gemini', 'groq', 'mistral', 'openrouter'];

// --- Config ---

function getConfigPath() {
  const dir = process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
  return `${dir}/config.yaml`;
}

export async function loadConfig() {
  try {
    const raw = await readFile(getConfigPath(), 'utf8');
    const config = parse(raw);
    return config && typeof config === 'object' ? config : null;
  } catch {
    return null;
  }
}

// --- Provider Resolution ---

export function resolveProvider(config = null) {
  // 1. Explicit config
  if (config?.provider) {
    const id = config.provider;
    const reg = PROVIDERS[id];
    if (!reg) return null;
    return {
      id,
      name: reg.name,
      apiFormat: reg.apiFormat,
      baseUrl: config.baseUrl || reg.baseUrl,
      apiKey: config.apiKey || (reg.envKey ? process.env[reg.envKey] : null),
      model: config.model || reg.defaultModel,
    };
  }

  // 2. Env var scan
  for (const id of DETECT_ORDER) {
    const reg = PROVIDERS[id];
    const key = process.env[reg.envKey];
    if (key) {
      return {
        id,
        name: reg.name,
        apiFormat: reg.apiFormat,
        baseUrl: reg.baseUrl,
        apiKey: key,
        model: reg.defaultModel,
      };
    }
  }

  return null;
}

// --- API Adapters ---

async function callAnthropic(baseUrl, apiKey, model, systemPrompt, userContent, signal) {
  const body = { model, max_tokens: 4096, messages: [{ role: 'user', content: userContent }] };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(baseUrl, apiKey, model, systemPrompt, userContent, signal) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userContent });

  // Use streaming to avoid server-side timeouts on long generations
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: 4096, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${model} API error ${res.status}: ${body.slice(0, 200)}`);
  }

  return readSSEStream(res.body, signal);
}

async function readSSEStream(body, signal) {
  const decoder = new TextDecoder();
  const chunks = [];

  for await (const raw of body) {
    if (signal?.aborted) break;
    const text = decoder.decode(raw, { stream: true });
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) chunks.push(content);
      } catch { /* skip malformed SSE lines */ }
    }
  }

  return chunks.join('');
}

// --- CLI Fallback ---

const activeProcs = new Set();

function forceKill(proc) {
  try { proc.stdin?.destroy(); } catch {}
  try { proc.stdout?.destroy(); } catch {}
  try { proc.stderr?.destroy(); } catch {}
  try { proc.kill('SIGKILL'); } catch {}
}

function killAllChildren() {
  for (const proc of activeProcs) {
    forceKill(proc);
  }
  activeProcs.clear();
}

process.on('SIGINT', () => { killAllChildren(); process.exit(130); });
process.on('SIGTERM', () => { killAllChildren(); process.exit(143); });
process.on('exit', killAllChildren);

function completeCLI(prompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn('claude', ['-p', '--model', 'haiku', '--no-session-persistence', '--allowedTools', ''], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcs.add(proc);

    let stdout = '';
    let stderr = '';
    let killed = false;

    let settled = false;
    const settle = (fn) => { if (!settled) { settled = true; fn(); } };

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      debug('llm: SIGTERM after timeout (CLI)');
      // SIGKILL 兜底：SIGTERM 5s 后强杀
      setTimeout(() => {
        if (activeProcs.has(proc)) {
          debug('llm: SIGKILL escalation (CLI)');
          forceKill(proc);
          activeProcs.delete(proc);
          settle(() => reject(new Error(`claude timed out after ${timeoutMs / 1000}s (force killed)`)));
        }
      }, 5000);
    }, timeoutMs);

    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('error', (err) => {
      clearTimeout(timer);
      activeProcs.delete(proc);
      debug(`llm: spawn error: ${err.message}`);
      if (err.code === 'ENOENT') {
        settle(() => reject(new Error('claude CLI not found. Is Claude Code installed?')));
      } else {
        settle(() => reject(err));
      }
    });

    // 用 exit 而非 close — close 依赖 stdio 关闭，进程挂起时可能永远不触发
    proc.on('exit', (code) => {
      clearTimeout(timer);
      activeProcs.delete(proc);
      // 销毁 stdio 防止 pipe 保持进程引用
      try { proc.stdin?.destroy(); } catch {}
      try { proc.stdout?.destroy(); } catch {}
      try { proc.stderr?.destroy(); } catch {}
      debug(`llm: CLI exit code=${code}, stdout=${stdout.length} chars`);
      if (killed) settle(() => reject(new Error(`claude timed out after ${timeoutMs / 1000}s`)));
      else if (code !== 0) settle(() => reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`)));
      else settle(() => resolve(stdout));
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// --- Main Entry ---

export async function complete(prompt, { timeoutMs = DEFAULT_TIMEOUT_MS, systemPrompt = null, model = null } = {}) {
  const markedPrompt = `${META_MARKER}\n${prompt}`;
  debug(`llm: prompt length=${markedPrompt.length} chars${systemPrompt ? `, system=${systemPrompt.length} chars` : ''}`);

  const config = await loadConfig();
  const provider = resolveProvider(config);

  if (provider) {
    const activeModel = model || provider.model;
    debug(`llm: using ${provider.name} (${activeModel}${model ? ' [override]' : ''})`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const call = provider.apiFormat === 'anthropic-messages' ? callAnthropic : callOpenAI;
      const result = await call(provider.baseUrl, provider.apiKey, activeModel, systemPrompt, markedPrompt, controller.signal);
      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`${provider.name} timed out after ${timeoutMs / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // CLI fallback — only outside Claude Code
  if (!process.env.CLAUDECODE) {
    debug('llm: no API provider found, falling back to claude CLI');
    return completeCLI(markedPrompt, { timeoutMs });
  }

  // Inside Claude Code with no API key — cannot proceed
  const envList = DETECT_ORDER.map(id => PROVIDERS[id].envKey).join(', ');
  throw new Error(
    `No LLM provider configured. Set one of: ${envList}\n` +
    `Or create ~/.your-taste/config.yaml with:\n` +
    `  provider: deepseek\n` +
    `  apiKey: sk-...\n` +
    `See https://github.com/SenZhangAI/your-taste#providers for details.`
  );
}
