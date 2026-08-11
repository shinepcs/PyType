import { createSeededRandom, hashSeed } from "../utils/random.js";

export const BLANK_TOKEN = "_____";

function assertVariants(parameters, expectedType) {
  if (!parameters || !Array.isArray(parameters.variants) || parameters.variants.length === 0) {
    throw new TypeError(`${expectedType} template parameters.variants must be a non-empty array.`);
  }
  return parameters.variants;
}

function variantCopy(parameters, random) {
  const variant = random.pick(assertVariants(parameters, "copy"));
  return {
    code: variant.code,
    output: variant.output,
    outputMode: variant.outputMode ?? "exact",
    answer: variant.code,
    acceptedAnswers: [variant.code],
  };
}

function variantFill(parameters, random) {
  const variant = random.pick(assertVariants(parameters, "fill"));
  return {
    code: variant.code,
    output: variant.output,
    outputMode: variant.outputMode ?? "exact",
    answer: variant.answer,
    acceptedAnswers: variant.acceptedAnswers ?? [variant.answer],
  };
}

function printLiteralCopy(parameters, random) {
  if (!parameters || !Array.isArray(parameters.values) || parameters.values.length === 0) {
    throw new TypeError("printLiteralCopy parameters.values must be a non-empty array.");
  }
  const value = random.pick(parameters.values);
  if (typeof value !== "string") {
    throw new TypeError("printLiteralCopy values must be strings.");
  }

  const literal = JSON.stringify(value);
  return {
    code: `print(${literal})`,
    output: value,
    outputMode: "exact",
    answer: `print(${literal})`,
    acceptedAnswers: [`print(${literal})`],
  };
}

function rangeFillAscending(parameters, random) {
  const { startMin, startMax, lengthMin, lengthMax } = parameters ?? {};
  for (const [name, value] of Object.entries({ startMin, startMax, lengthMin, lengthMax })) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`rangeFillAscending ${name} must be a safe integer.`);
    }
  }
  if (startMax < startMin || lengthMax < lengthMin || lengthMin < 1) {
    throw new RangeError("rangeFillAscending parameter ranges are invalid.");
  }

  const start = random.int(startMin, startMax);
  const length = random.int(lengthMin, lengthMax);
  const stop = start + length;
  const output = Array.from({ length }, (_, index) => String(start + index)).join("\n");

  return {
    code: `for i in ${BLANK_TOKEN}(${start}, ${stop}):\n    print(i)`,
    output,
    outputMode: "exact",
    answer: "range",
    acceptedAnswers: ["range"],
  };
}

function assertInterpolationParameters(parameters, expectedType) {
  if (!parameters || !Array.isArray(parameters.cases) || parameters.cases.length === 0) {
    throw new TypeError(`${expectedType} interpolation parameters.cases must be a non-empty array.`);
  }
  return parameters;
}

function renderPattern(pattern, values, fieldName) {
  if (typeof pattern !== "string") {
    throw new TypeError(`${fieldName} must be a string pattern.`);
  }
  const result = pattern.replace(/\{\{([a-z][A-Za-z0-9]*)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) {
      throw new RangeError(`Missing interpolation value: ${key}`);
    }
    const value = values[key];
    if (!["string", "number", "boolean"].includes(typeof value)) {
      throw new TypeError(`Interpolation value ${key} must be a string, number, or boolean.`);
    }
    return String(value);
  });
  if (result.includes("{{") || result.includes("}}")) {
    throw new RangeError(`${fieldName} contains an invalid or unresolved placeholder.`);
  }
  return result;
}

function interpolateCopy(parameters, random) {
  const config = assertInterpolationParameters(parameters, "copy");
  const values = random.pick(config.cases);
  const code = renderPattern(config.code, values, "code");
  return {
    code,
    output: renderPattern(config.output, values, "output"),
    outputMode: config.outputMode ?? "exact",
    answer: code,
    acceptedAnswers: [code],
  };
}

function interpolateFill(parameters, random) {
  const config = assertInterpolationParameters(parameters, "fill");
  const values = random.pick(config.cases);
  const answer = renderPattern(config.answer, values, "answer");
  const acceptedPatterns = config.acceptedAnswers ?? [config.answer];
  if (!Array.isArray(acceptedPatterns) || acceptedPatterns.length === 0) {
    throw new TypeError("acceptedAnswers must be a non-empty array of patterns.");
  }
  return {
    code: renderPattern(config.code, values, "code"),
    output: renderPattern(config.output, values, "output"),
    outputMode: config.outputMode ?? "exact",
    answer,
    acceptedAnswers: acceptedPatterns.map((pattern) => renderPattern(pattern, values, "acceptedAnswers")),
  };
}

const GENERATORS = Object.freeze({
  interpolateCopy,
  interpolateFill,
  printLiteralCopy,
  rangeFillAscending,
  variantCopy,
  variantFill,
});

function normalizeSeedForInstance(seed) {
  if (typeof seed === "string" || typeof seed === "number" || typeof seed === "boolean" || seed === null) {
    return seed;
  }
  if (typeof seed === "bigint") {
    return seed.toString();
  }
  if (seed === undefined) {
    return "default";
  }
  throw new TypeError("Unsupported template seed type.");
}

export function getRegisteredGeneratorIds() {
  return Object.keys(GENERATORS);
}

export function hasGenerator(generatorId) {
  return Object.hasOwn(GENERATORS, generatorId);
}

export function generateQuestion(template, seed = "default") {
  if (!template || typeof template !== "object" || Array.isArray(template)) {
    throw new TypeError("A template object is required.");
  }

  const generator = GENERATORS[template.generatorId];
  if (!generator) {
    throw new RangeError(`Unknown generatorId: ${String(template.generatorId)}`);
  }

  const normalizedSeed = normalizeSeedForInstance(seed);
  const generated = generator(template.parameters, createSeededRandom(normalizedSeed));
  const seedHash = hashSeed(normalizedSeed).toString(16).padStart(8, "0");
  const instanceId = `${template.id}@${seedHash}`;

  return {
    id: instanceId,
    instanceId,
    sourceId: template.id,
    seed: normalizedSeed,
    contentVersion: template.contentVersion,
    level: template.level,
    type: template.type,
    skill: template.skill,
    difficulty: template.difficulty,
    code: generated.code,
    output: generated.output,
    outputMode: generated.outputMode ?? "exact",
    answer: generated.answer,
    acceptedAnswers: [...generated.acceptedAnswers],
    targetSeconds: template.targetSeconds,
    tags: [...template.tags],
  };
}
