export const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9_]{2,12}$/u;

export function normalizeNickname(value) {
  return String(value ?? "").trim();
}
export function validateNickname(value) {
  const nickname = normalizeNickname(value);
  return {
    valid: NICKNAME_PATTERN.test(nickname),
    value: nickname,
    message: NICKNAME_PATTERN.test(nickname) ? "" : "닉네임은 2~12자 한글·영문·숫자·밑줄만 사용할 수 있습니다.",
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function createSessionId(cryptoImpl = globalThis.crypto) {
  if (cryptoImpl?.randomUUID) return cryptoImpl.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoImpl?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
