import { resolveRegion } from "./regions.js";
import { redact } from "./redact.js";

export class BlandError extends Error {
  constructor(message, { status, body, endpoint } = {}) {
    super(message);
    this.name = "BlandError";
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

/** Small REST client. No secrets are logged or returned in errors. */
export class BlandClient {
  constructor({
    apiKey,
    region,
    authScheme = process.env.BLAND_AUTH_SCHEME || "raw",
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.BLAND_TIMEOUT_MS || 60_000),
  } = {}) {
    if (!apiKey) {
      throw new Error("No Bland API key found. Run bland_connect_start (device flow) or set BLAND_API_KEY.");
    }
    if (!fetchImpl) throw new Error("This Node runtime has no global fetch.");
    this.apiKey = apiKey;
    this.region = resolveRegion(region);
    this.authScheme = authScheme.toLowerCase() === "bearer" ? "bearer" : "raw";
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  get baseURL() {
    return this.region.api;
  }

  /** Substitute `{name}` path parameters and append query parameters. */
  buildURL(path, { pathParams = {}, query = {} } = {}) {
    let rendered = String(path);
    for (const [key, value] of Object.entries(pathParams)) {
      if (value === undefined || value === null || value === "") {
        throw new Error(`Missing path parameter "${key}" for ${path}`);
      }
      rendered = rendered.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
    }
    const leftover = rendered.match(/\{[^}]+\}/);
    if (leftover) throw new Error(`Missing path parameter ${leftover[0]} for ${path}`);

    const url = new URL(`${this.baseURL}${rendered.startsWith("/") ? rendered : `/${rendered}`}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    return url;
  }

  async request({
    method = "GET",
    path,
    pathParams,
    query,
    body,
    headers = {},
    signal,
    idempotencyKey,
    raw = false,
    formData,
  } = {}) {
    const url = this.buildURL(path, { pathParams, query });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    const relayAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener?.("abort", relayAbort, { once: true });

    const requestHeaders = {
      authorization: this.authScheme === "bearer" ? `Bearer ${this.apiKey}` : this.apiKey,
      ...(formData ? {} : { "content-type": "application/json" }),
      accept: "application/json",
      ...headers,
    };
    if (idempotencyKey) requestHeaders["idempotency-key"] = idempotencyKey;

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: String(method).toUpperCase(),
        headers: requestHeaders,
        body: formData ?? (body === undefined || body === null ? undefined : JSON.stringify(body)),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new BlandError(`Bland request timed out after ${this.timeoutMs}ms`, { endpoint: path });
      }
      throw new BlandError(redact(error.message, [this.apiKey]), { endpoint: path });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", relayAbort);
    }

    const text = await response.text();
    let data = text;
    if (!raw && text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new BlandError(
        `Bland ${String(method).toUpperCase()} ${path} failed (${response.status}): ${redact(detail.slice(0, 1000), [this.apiKey])}`,
        { status: response.status, body: data, endpoint: path },
      );
    }
    return { status: response.status, data };
  }

  get(path, options) {
    return this.request({ method: "GET", path, ...options });
  }

  post(path, body, options) {
    return this.request({ method: "POST", path, body, ...options });
  }

  put(path, body, options) {
    return this.request({ method: "PUT", path, body, ...options });
  }

  patch(path, body, options) {
    return this.request({ method: "PATCH", path, body, ...options });
  }

  delete(path, options) {
    return this.request({ method: "DELETE", path, ...options });
  }
}

/** Requests used before an API key exists (device onboarding). */
export async function unauthenticatedRequest({
  path,
  body,
  method = "POST",
  region,
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  const base = resolveRegion(region);
  const url = new URL(`${base.api}${path.startsWith("/") ? path : `/${path}`}`);
  const response = await fetchImpl(url, {
    method: String(method).toUpperCase(),
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  let data = text;
  try {
    if (text) data = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  if (!response.ok) {
    const error = new Error(`Bland onboarding ${path} failed (${response.status}): ${redact(String(text).slice(0, 1000))}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}
