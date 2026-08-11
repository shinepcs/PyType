import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertValidContentBundle,
  formatContentIssues,
  validateContentBundle,
} from "../js/content/validate-content.js";

async function readJson(path) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

export async function validateContentDirectory(dataDirectory) {
  const [skills, questions, templates] = await Promise.all([
    readJson(resolve(dataDirectory, "skills.json")),
    readJson(resolve(dataDirectory, "questions.json")),
    readJson(resolve(dataDirectory, "question-templates.json")),
  ]);
  const bundle = { skills, questions, templates };
  const report = validateContentBundle(bundle);
  if (!report.valid) {
    const error = new Error(formatContentIssues(report.issues));
    error.report = report;
    throw error;
  }
  return assertValidContentBundle(bundle);
}

async function main() {
  const requestedDirectory = process.argv[2] ?? "data";
  const dataDirectory = resolve(process.cwd(), requestedDirectory);
  const report = await validateContentDirectory(dataDirectory);
  const { stats } = report;
  const skillMinimum = Math.min(...Object.values(stats.bySkill));

  console.log(`Content version: ${stats.contentVersion}`);
  console.log(`Verified equivalents: ${stats.totalEquivalentCount} (${stats.staticCount} static + ${stats.generatedEquivalentCount} generated)`);
  console.log(`Levels: L1 ${stats.byLevel[1]}, L2 ${stats.byLevel[2]}`);
  console.log(`Skills: ${stats.skills}, minimum coverage per skill: ${skillMinimum}`);
  console.log(`Templates: ${stats.templateCount}; generators: ${stats.registeredGenerators.join(", ")}`);
}

const isEntryPoint = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
