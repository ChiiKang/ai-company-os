import path from "node:path";

export const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

const SECRET_PATTERNS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
];

export function sanitizeText(value, maxLength = 180) {
  let text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }

  text = text
    .replace(/(?:file:\/\/)?\/(?:Users|home|private|var|tmp|opt|Volumes)\/[^\s,;)]+/g, "[local path]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, "$1");

  if (text.length > maxLength) text = `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  return text;
}

export function safeId(value) {
  const text = String(value ?? "");
  return SAFE_ID_PATTERN.test(text) ? text : null;
}

export function projectLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Unassigned";
  const normalized = text.replace(/[\\/]+$/, "");
  return sanitizeText(path.basename(normalized) || normalized, 72) || "Unassigned";
}

export function humanizeId(value) {
  const id = safeId(value) ?? "agent";
  return sanitizeText(id.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), 96);
}

export function cleanBacklogTitle(value) {
  return sanitizeText(
    String(value ?? "")
      .replace(/https?:\/\/[^\s)]+/g, "")
      .replace(/\bdata\/[^\s)]+\/report\.md\b/g, "")
      .replace(/\s*\((?:repo|kind|priority|hold|hold-kind):[^)]*\)/gi, "")
      .replace(/\s*\((?:since|merged|reported|done)\s+[^)]*\)/gi, "")
      .replace(/\s+blocked-by:\s*[^\s)]+(?:\s+-\s+.*)?$/i, "")
      .replace(/\s+-\s+local main\s*$/i, "")
      .replace(/\s+-\s*$/, ""),
    160,
  );
}

export function sanitizeStateDetail(value) {
  return sanitizeText(value, 200);
}
