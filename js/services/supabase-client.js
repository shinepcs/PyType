export const AUTH_STORAGE_KEY = "pythonTypingSurvival:supabase-auth:v1";

const SAFE_MESSAGES = Object.freeze({
  not_configured: "Online ranking is not configured.",
  offline: "Online ranking is unavailable while offline.",
  timeout: "The ranking request timed out.",
  network_error: "The ranking service could not be reached.",
  authorization: "Anonymous ranking authorization failed.",
  auth_required: "Anonymous ranking authorization is required.",
  conflict: "The ranking entry already exists.",
  invalid_request: "The ranking request was rejected.",
  rate_limited: "The ranking service is busy. Try again shortly.",
  server_error: "The ranking service is temporarily unavailable.",
  invalid_response: "The ranking service returned an invalid response.",
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function defaultOnlineCheck() {
  return typeof globalThis.navigator === "undefined" || globalThis.navigator.onLine !== false;
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isPlaceholder(value) {
  return typeof value !== "string"
    || value.trim().length < 12
    || /YOUR_|PLACEHOLDER|example\.com/i.test(value);
}

export function isSupabaseConfigured(config = {}) {
  return config.enabled !== false
    && normalizeBaseUrl(config.url) !== null
    && !isPlaceholder(config.url)
    && !isPlaceholder(config.publishableKey);
}

export class SupabaseClientError extends Error {
  constructor(code, { status = 0, retryable = false, cause } = {}) {
    super(SAFE_MESSAGES[code] ?? SAFE_MESSAGES.invalid_request, cause ? { cause } : undefined);
    this.name = "SupabaseClientError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function toSafeNetworkError(error) {
  const known = error instanceof SupabaseClientError
    ? error
    : new SupabaseClientError("network_error", { retryable: true });
  return Object.freeze({
    code: known.code,
    message: known.message,
    retryable: known.retryable,
  });
}

function classifyHttpError(status, databaseCode) {
  if (status === 409 || databaseCode === "23505") return "conflict";
  if (status === 401 || status === 403 || databaseCode === "42501") return "authorization";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "invalid_request";
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function normalizeSession(response, nowMs) {
  if (!response || typeof response !== "object") return null;
  const accessToken = response.access_token;
  const refreshToken = response.refresh_token;
  const userId = response.user?.id;
  const expiresAt = Number(response.expires_at)
    || Math.floor(nowMs / 1_000) + Number(response.expires_in ?? 0);
  if (typeof accessToken !== "string" || accessToken.length < 20
      || typeof refreshToken !== "string" || refreshToken.length < 10
      || !UUID_PATTERN.test(userId)
      || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return {
    accessToken,
    refreshToken,
    expiresAt,
    userId,
  };
}

function parseStoredSession(raw) {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (typeof value.accessToken !== "string" || value.accessToken.length < 20
        || typeof value.refreshToken !== "string" || value.refreshToken.length < 10
        || !UUID_PATTERN.test(value.userId)
        || !Number.isFinite(value.expiresAt)) {
      return null;
    }
    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt,
      userId: value.userId,
    };
  } catch {
    return null;
  }
}

export class SupabaseRestClient {
  constructor({
    url,
    publishableKey,
    enabled = true,
    requestTimeoutMs = 8_000,
    maxRetries = 1,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    authStorage = defaultStorage(),
    authStorageKey = AUTH_STORAGE_KEY,
    onlineCheck = defaultOnlineCheck,
    now = () => Date.now(),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    scheduleTimeout = (callback, milliseconds) => setTimeout(callback, milliseconds),
    cancelTimeout = (timeoutId) => clearTimeout(timeoutId),
  } = {}) {
    this.baseUrl = normalizeBaseUrl(url);
    this.publishableKey = publishableKey;
    this.enabled = enabled;
    this.requestTimeoutMs = Math.max(250, Math.min(30_000, Number(requestTimeoutMs) || 8_000));
    this.maxRetries = Math.max(0, Math.min(2, Math.trunc(Number(maxRetries) || 0)));
    this.fetchImpl = fetchImpl;
    this.authStorage = authStorage;
    this.authStorageKey = authStorageKey;
    this.onlineCheck = typeof onlineCheck === "function" ? onlineCheck : defaultOnlineCheck;
    this.now = now;
    this.sleep = sleep;
    this.scheduleTimeout = scheduleTimeout;
    this.cancelTimeout = cancelTimeout;
    this.session = null;
    this.authPromise = null;
  }

  isConfigured() {
    return isSupabaseConfigured({
      enabled: this.enabled,
      url: this.baseUrl,
      publishableKey: this.publishableKey,
    }) && typeof this.fetchImpl === "function";
  }

  assertAvailable() {
    if (!this.isConfigured()) {
      throw new SupabaseClientError("not_configured");
    }
    if (!this.onlineCheck()) {
      throw new SupabaseClientError("offline", { retryable: true });
    }
  }

  loadStoredSession() {
    if (this.session) return this.session;
    try {
      this.session = parseStoredSession(this.authStorage?.getItem(this.authStorageKey));
    } catch {
      this.session = null;
    }
    return this.session;
  }

  persistSession(session) {
    this.session = session;
    try {
      this.authStorage?.setItem(this.authStorageKey, JSON.stringify(session));
    } catch {
      // Persistence failure changes only identity continuity; this page session remains usable.
    }
  }

  clearSession() {
    this.session = null;
    try {
      this.authStorage?.removeItem(this.authStorageKey);
    } catch {
      // Clearing the in-memory session is sufficient for the current page.
    }
  }

  async request(path, {
    method = "GET",
    body,
    accessToken = null,
    authenticated = false,
    headers = {},
    retries,
    idempotent = method === "GET",
  } = {}) {
    this.assertAvailable();
    if (typeof path !== "string" || path.startsWith("http:") || path.startsWith("https:")) {
      throw new SupabaseClientError("invalid_request");
    }
    if (authenticated && !accessToken) {
      throw new SupabaseClientError("auth_required");
    }

    const allowedRetries = Math.max(
      0,
      Math.min(2, retries === undefined ? this.maxRetries : Math.trunc(Number(retries) || 0)),
    );
    const requestHeaders = {
      apikey: this.publishableKey,
      Authorization: "Bearer " + (accessToken || this.publishableKey),
      Accept: "application/json",
      ...headers,
    };
    if (body !== undefined) requestHeaders["Content-Type"] = "application/json";

    let lastError;
    for (let attempt = 0; attempt <= allowedRetries; attempt += 1) {
      const controller = new AbortController();
      let didTimeout = false;
      const timeoutId = this.scheduleTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, this.requestTimeoutMs);

      try {
        const response = await this.fetchImpl(
          this.baseUrl + "/" + path.replace(/^\/+/, ""),
          {
            method,
            headers: requestHeaders,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          let databaseCode = null;
          try {
            const errorBody = await response.json();
            databaseCode = typeof errorBody?.code === "string" ? errorBody.code : null;
          } catch {
            databaseCode = null;
          }
          const code = classifyHttpError(response.status, databaseCode);
          throw new SupabaseClientError(code, {
            status: response.status,
            retryable: isRetryableStatus(response.status),
          });
        }

        if (response.status === 204) {
          this.cancelTimeout(timeoutId);
          return null;
        }
        const text = await response.text();
        this.cancelTimeout(timeoutId);
        if (text === "") return null;
        try {
          return JSON.parse(text);
        } catch {
          throw new SupabaseClientError("invalid_response");
        }
      } catch (error) {
        this.cancelTimeout(timeoutId);
        if (error instanceof SupabaseClientError) {
          lastError = error;
        } else if (didTimeout || error?.name === "AbortError") {
          lastError = new SupabaseClientError("timeout", { retryable: true });
        } else {
          lastError = new SupabaseClientError("network_error", { retryable: true });
        }

        const canRetry = attempt < allowedRetries && idempotent && lastError.retryable;
        if (!canRetry) throw lastError;
        await this.sleep(150 * (2 ** attempt));
      }
    }
    throw lastError ?? new SupabaseClientError("network_error", { retryable: true });
  }

  async createAnonymousSession() {
    const response = await this.request("auth/v1/signup", {
      method: "POST",
      body: {},
      retries: 0,
      idempotent: false,
    });
    const session = normalizeSession(response, this.now());
    if (!session) throw new SupabaseClientError("invalid_response");
    this.persistSession(session);
    return { accessToken: session.accessToken, userId: session.userId };
  }

  async refreshAnonymousSession(session) {
    const response = await this.request("auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refreshToken },
      retries: this.maxRetries,
      idempotent: true,
    });
    const refreshed = normalizeSession(response, this.now());
    if (!refreshed) throw new SupabaseClientError("invalid_response");
    this.persistSession(refreshed);
    return { accessToken: refreshed.accessToken, userId: refreshed.userId };
  }

  async ensureAnonymousSession() {
    this.assertAvailable();
    if (this.authPromise) return this.authPromise;
    this.authPromise = (async () => {
      const stored = this.loadStoredSession();
      const nowSeconds = Math.floor(this.now() / 1_000);
      if (stored && stored.expiresAt > nowSeconds + 60) {
        return { accessToken: stored.accessToken, userId: stored.userId };
      }
      if (stored?.refreshToken) {
        try {
          return await this.refreshAnonymousSession(stored);
        } catch (error) {
          const expiredCredential = error instanceof SupabaseClientError
            && (error.code === "authorization" || error.code === "invalid_request");
          if (!expiredCredential) {
            throw error;
          }
          this.clearSession();
        }
      }
      return this.createAnonymousSession();
    })();
    try {
      return await this.authPromise;
    } finally {
      this.authPromise = null;
    }
  }

  async rpc(functionName, parameters = {}, { authenticated = false } = {}) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(functionName)) {
      throw new SupabaseClientError("invalid_request");
    }
    const session = authenticated ? await this.ensureAnonymousSession() : null;
    return this.request("rest/v1/rpc/" + functionName, {
      method: "POST",
      body: parameters,
      accessToken: session?.accessToken,
      authenticated,
      retries: this.maxRetries,
      idempotent: true,
    });
  }

  async insert(tableName, row, { idempotent = false } = {}) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(tableName)) {
      throw new SupabaseClientError("invalid_request");
    }
    const session = await this.ensureAnonymousSession();
    const response = await this.request("rest/v1/" + tableName, {
      method: "POST",
      body: row,
      accessToken: session.accessToken,
      authenticated: true,
      headers: { Prefer: "return=minimal" },
      retries: this.maxRetries,
      idempotent,
    });
    return { response, userId: session.userId };
  }
}

export function createSupabaseClient(config) {
  return new SupabaseRestClient(config);
}
