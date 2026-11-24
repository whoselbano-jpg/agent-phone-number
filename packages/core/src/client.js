import { redact } from "./redact.js";

export class TwilioError extends Error {
  constructor(message, { status, body, endpoint } = {}) {
    super(message);
    this.name = "TwilioError";
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

/** Small Twilio REST client. No credentials are logged or returned in errors. */
export class TwilioClient {
  constructor({
    accountSid,
    username,
    password,
    baseURL = "https://api.twilio.com",
    fetchImpl = globalThis.fetch,
    timeoutMs = Number(process.env.TWILIO_TIMEOUT_MS || 60_000),
  } = {}) {
    if (!accountSid) {
      throw new Error(
        "No Twilio Account SID found. Set TWILIO_ACCOUNT_SID or write it to the credentials file.",
      );
    }
    if (!password) {
      throw new Error(
        "No Twilio auth secret found. Set TWILIO_AUTH_TOKEN (or TWILIO_API_KEY + TWILIO_API_SECRET).",
      );
    }
    if (!fetchImpl) throw new Error("This Node runtime has no global fetch.");
    this.accountSid = accountSid;
    this.username = username || accountSid;
    this.password = password;
    this.auth = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    this.baseURL = baseURL;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  /** Substitute `{name}` placeholders and append query parameters. */
  buildURL(path, { pathParams = {}, query = {} } = {}) {
    let rendered = String(path || "/");
    for (const key of ["account_sid", "AccountSid", "accountSid"]) {
      rendered = rendered.replaceAll(`{${key}}`, encodeURIComponent(this.accountSid));
    }
    for (const [key, value] of Object.entries(pathParams || {})) {
      if (value === undefined || value === null || value === "") {
        throw new Error(`Missing path parameter "${key}" for ${path}`);
      }
      rendered = rendered.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
    }
    const leftover = rendered.match(/\{[^}]+\}/);
    if (leftover) throw new Error(`Missing path parameter ${leftover[0]} for ${path}`);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rendered) || rendered.startsWith("//")) {
      throw new Error("Absolute URLs are not allowed in twilio_api_request; pass an API path.");
    }

    const url = new URL(rendered.startsWith("/") ? rendered : `/${rendered}`, this.baseURL);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    return url;
  }

  /** Twilio's REST API expects application/x-www-form-urlencoded bodies. */
  encodeForm(body) {
    if (body instanceof URLSearchParams) return body;
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) form.append(key, String(item));
      } else if (typeof value === "object") {
        form.append(key, JSON.stringify(value));
      } else {
        form.append(key, String(value));
      }
    }
    return form;
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
  } = {}) {
    const verb = String(method).toUpperCase();
    const url = this.buildURL(path, { pathParams, query });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    const relayAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener?.("abort", relayAbort, { once: true });

    const hasBody = !["GET", "HEAD"].includes(verb) && body !== undefined && body !== null;
    const requestHeaders = {
      authorization: `Basic ${this.auth}`,
      accept: "application/json",
      ...(hasBody ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...headers,
    };
    if (idempotencyKey) requestHeaders["idempotency-key"] = idempotencyKey;

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: verb,
        headers: requestHeaders,
        body: hasBody ? this.encodeForm(body).toString() : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new TwilioError(`Twilio request timed out after ${this.timeoutMs}ms`, { endpoint: path });
      }
      throw new TwilioError(redact(error.message, [this.password]), { endpoint: path });
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
      throw new TwilioError(
        `Twilio ${verb} ${path} failed (${response.status}): ${redact(detail.slice(0, 1000), [this.password])}`,
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
