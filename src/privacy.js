const PATTERNS = [
  { regex: /\b\d{13,19}\b/g, replacement: '[CARD]' },
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },
  { regex: /\b(?:sk|pk|api|key|token)[_-][a-zA-Z0-9_-]{16,}\b/gi, replacement: '[KEY]' },
  { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  { regex: /(?:password|secret|token|credential)\s*[=:]\s*["']?[^\s"']+["']?/gi, replacement: '[SECRET]' },
  { regex: /\+?\d{1,4}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, replacement: '[PHONE]' },
  { regex: /\b[A-Z0-9]{20,40}\b/g, replacement: '[TOKEN]' },
];

export function filterSensitiveData(text) {
  let result = text;
  for (const { regex, replacement } of PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}
