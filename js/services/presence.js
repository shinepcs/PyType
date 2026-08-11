import { SupabaseClientError, toSafeNetworkError } from "./supabase-client.js";

const NAME_PATTERN = /^[가-힣A-Za-z0-9_]{2,12}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;

function failure(error) {
  const safe = toSafeNetworkError(error);
  return Object.freeze({
    ok: false,
    status: safe.code === "offline" || safe.code === "not_configured" ? "offline" : "error",
    error: safe,
  });
}

export class PresenceService {
  constructor({ client = null } = {}) {
    this.client = client;
  }

  isAvailable() {
    return Boolean(this.client)
      && (typeof this.client.isConfigured !== "function" || this.client.isConfigured());
  }

  async heartbeat(playerName) {
    if (!NAME_PATTERN.test(playerName ?? "")) {
      return Object.freeze({ ok: false, status: "invalid", errors: ["player_name_invalid"] });
    }
    if (!this.isAvailable()) return failure(new SupabaseClientError("not_configured"));
    try {
      await this.client.ensureAnonymousSession();
      await this.client.rpc("touch_online_player", { p_player_name: playerName }, { authenticated: true });
      return Object.freeze({ ok: true, status: "online" });
    } catch (error) {
      return failure(error);
    }
  }

  async getOnlinePlayers({ contentVersion, limit = 50 } = {}) {
    if (!VERSION_PATTERN.test(contentVersion ?? "") || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return Object.freeze({ ok: false, status: "invalid", errors: ["query_invalid"] });
    }
    if (!this.isAvailable()) return failure(new SupabaseClientError("not_configured"));
    try {
      const response = await this.client.rpc("get_online_players", {
        p_content_version: contentVersion,
        p_limit: limit,
      });
      if (!Array.isArray(response)) return failure(new SupabaseClientError("invalid_response"));
      const players = response.map((row) => ({
        playerName: row?.player_name,
        bestScore: Number(row?.best_score),
      }));
      if (!players.every((player) => NAME_PATTERN.test(player.playerName ?? "")
          && Number.isInteger(player.bestScore) && player.bestScore >= 0 && player.bestScore <= 10_000_000)) {
        return failure(new SupabaseClientError("invalid_response"));
      }
      return Object.freeze({ ok: true, status: players.length === 0 ? "empty" : "ready", players });
    } catch (error) {
      return failure(error);
    }
  }
}

export function createPresenceService(options) {
  return new PresenceService(options);
}
