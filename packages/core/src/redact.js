const RULES = [
  { re: /\b(?:AC|CA|PN|SK|AP|BY)[a-f0-9]{32}\b/gi, replace: () => "[REDACTED]" },
  { re: /\b(?:sk|rk_live|pk_live)_[a-z0-9_-]{8,}\b/gi, replace: () => "[REDACTED]" },
  {
    re: /(api[_-]?key\s*[:=]\s*"?)(?:bearer\s+)?([^"\s,}]{6,})/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED]`,
  },
  {
    re: /(auth[_-]?token|api[_-]?secret|password)\s*[:=]\s*"?([^"\s,}]{6,})/gi,
    replace: (_match, label) => `${label}=[REDACTED]`,
  },
  {
    re: /(authorization\s*[:=]\s*"?)(?:(?:basic|bearer)\s+)?([^"\s,}]{6,})/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED]`,
  },
];

/** Remove likely secrets from arbitrary text before it reaches a transcript or log. */
export function redact(text, extraSecrets = []) {
  let out = String(text ?? "");
  const secrets = extraSecrets
    .filter((value) => typeof value === "string" && value.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) out = out.split(secret).join("[REDACTED]");
  for (const rule of RULES) out = out.replace(rule.re, rule.replace);
  return out;
}

/** Non-reversible, short identifier useful for confirming which secret is active. */
export function fingerprint(secret) {
  if (!secret) return "none";
  let hash = 0;
  for (let i = 0; i < secret.length; i += 1) {
    hash = ((hash << 5) - hash + secret.charCodeAt(i)) | 0;
  }
  return `fp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function maskPhone(phone) {
  if (!phone) return "none";
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 4 ? `…${digits.slice(-4)}` : "…";
}
