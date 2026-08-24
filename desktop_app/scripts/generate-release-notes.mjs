import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_CATEGORIES = Object.freeze([
  "feat",
  "fix",
  "display",
  "perf",
  "security",
  "refactor",
  "build",
  "docs",
]);

export function parseConventionalCommit(subject) {
  const match = /^([a-z][a-z0-9-]*)(?:\(([^)]+)\))?(!)?:\s+(.+)$/i.exec(subject.trim());
  if (!match) return null;
  const [, rawType, scope, breakingMarker, description] = match;
  if (!rawType || !description) return null;
  return {
    type: rawType.toLowerCase(),
    scope: scope?.trim() || null,
    breaking: Boolean(breakingMarker),
    description: description.trim(),
  };
}

function commitSummary(commit) {
  const summary = commit.scope ? `${commit.scope}: ${commit.description}` : commit.description;
  return commit.breaking ? `${summary} [breaking]` : summary;
}

function releaseUrl(repository, suffix) {
  return `https://github.com/${repository}/${suffix}`;
}

export function renderReleaseNotes({ subjects, currentTag, previousTag, repository }) {
  const categorized = new Map(RELEASE_CATEGORIES.map((category) => [category, []]));
  for (const subject of subjects) {
    const commit = parseConventionalCommit(subject);
    if (!commit || !categorized.has(commit.type)) continue;
    categorized.get(commit.type).push(commitSummary(commit));
  }

  const lines = [];
  for (const category of RELEASE_CATEGORIES) {
    const entries = categorized.get(category);
    if (!entries || entries.length === 0) continue;
    lines.push(`**${category}**`, ...entries.map((entry) => ` - ${entry}`), "");
  }

  if (previousTag) {
    const comparison = `${previousTag}...${currentTag}`;
    lines.push(
      `**Full Changelog**: [${comparison}](${releaseUrl(
        repository,
        `compare/${encodeURIComponent(previousTag)}...${encodeURIComponent(currentTag)}`,
      )})`,
    );
  } else {
    lines.push(
      `**Full Changelog**: [${currentTag}](${releaseUrl(
        repository,
        `commits/${encodeURIComponent(currentTag)}`,
      )})`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function verifyTag(tag, label) {
  try {
    execFileSync("git", ["check-ref-format", `refs/tags/${tag}`], { stdio: "ignore" });
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`], {
      stdio: "ignore",
    });
  } catch {
    throw new Error(`${label} does not resolve to a valid local Git tag: ${tag}`);
  }
}

function gitSubjects(currentTag, previousTag) {
  const range = previousTag ? `${previousTag}..${currentTag}` : currentTag;
  const output = execFileSync("git", ["log", "--format=%s", range], {
    encoding: "utf8",
  });
  return output
    .split("\n")
    .map((subject) => subject.trim())
    .filter(Boolean);
}

export function generateReleaseNotesFromEnvironment() {
  const currentTag = requiredEnvironment("RELEASE_CURRENT_TAG");
  const previousTag = process.env.RELEASE_PREVIOUS_TAG?.trim() || "";
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`GITHUB_REPOSITORY has an invalid owner/name value: ${repository}`);
  }

  verifyTag(currentTag, "Current release tag");
  if (previousTag) verifyTag(previousTag, "Previous release tag");
  const notes = renderReleaseNotes({
    subjects: gitSubjects(currentTag, previousTag),
    currentTag,
    previousTag,
    repository,
  });
  const outputPath = resolve(process.env.RELEASE_NOTES_PATH?.trim() || "release-notes.md");
  writeFileSync(outputPath, notes, "utf8");
  process.stdout.write(notes);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) generateReleaseNotesFromEnvironment();
