const UINT32_RANGE = 0x1_0000_0000;

function canonicalizeSeed(seed) {
  if (typeof seed === "string") {
    return `string:${seed}`;
  }

  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new TypeError("Seed numbers must be finite.");
    }
    return `number:${Object.is(seed, -0) ? 0 : seed}`;
  }

  if (typeof seed === "bigint") {
    return `bigint:${seed.toString()}`;
  }

  if (typeof seed === "boolean" || seed === null) {
    return `${typeof seed}:${String(seed)}`;
  }

  if (seed === undefined) {
    return "undefined:";
  }

  throw new TypeError("Seeds must be strings, finite numbers, bigints, booleans, null, or undefined.");
}

/**
 * Converts a supported seed into a stable unsigned 32-bit integer.
 * FNV-1a is used only as a deterministic hash; it is not cryptographic.
 */
export function hashSeed(seed) {
  const text = canonicalizeSeed(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function deriveSeed(seed, ...parts) {
  const combined = [canonicalizeSeed(seed), ...parts.map(canonicalizeSeed)].join("\u001f");
  return hashSeed(combined);
}

export function randomInt(random, minimum, maximum) {
  if (typeof random !== "function") {
    throw new TypeError("random must be a function.");
  }
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
    throw new RangeError("randomInt requires safe integer bounds with maximum >= minimum.");
  }

  const span = maximum - minimum + 1;
  if (span > UINT32_RANGE) {
    throw new RangeError("randomInt supports ranges no larger than 2^32.");
  }

  return minimum + Math.floor(random() * span);
}

export function pickOne(random, values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError("pickOne requires a non-empty array.");
  }
  return values[randomInt(random, 0, values.length - 1)];
}

export function shuffle(random, values) {
  if (!Array.isArray(values)) {
    throw new TypeError("shuffle requires an array.");
  }

  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(random, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * Creates a Mulberry32-based deterministic random function.
 * The returned callable also exposes convenience helpers without mutable globals.
 */
export function createSeededRandom(seed) {
  const initialSeed = hashSeed(seed);
  let state = initialSeed;

  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };

  random.int = (minimum, maximum) => randomInt(random, minimum, maximum);
  random.pick = (values) => pickOne(random, values);
  random.shuffle = (values) => shuffle(random, values);
  random.fork = (...parts) => createSeededRandom(deriveSeed(initialSeed, ...parts));
  random.getState = () => state >>> 0;
  random.initialSeed = initialSeed;

  return random;
}
