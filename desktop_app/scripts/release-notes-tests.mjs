import assert from "node:assert/strict";
import test from "node:test";
import { parseConventionalCommit, renderReleaseNotes } from "./generate-release-notes.mjs";

test("parses scoped and breaking Conventional Commits", () => {
  assert.deepEqual(parseConventionalCommit("feat(editor)!: add project colors"), {
    type: "feat",
    scope: "editor",
    breaking: true,
    description: "add project colors",
  });
  assert.equal(parseConventionalCommit("merge branch main"), null);
});

test("renders release-worthy commits by category", () => {
  const notes = renderReleaseNotes({
    subjects: [
      "fix(desktop): stabilize Wayland",
      "feat(editor): add project colors",
      "display(canvas): improve bead contrast",
      "perf: redraw dirty rectangles",
      "docs: explain package installation",
      "test: cover palette state",
      "ci: publish releases",
    ],
    currentTag: "v1.0.2",
    previousTag: "v1.0.1",
    repository: "EulCau/PerlerDrawing",
  });

  assert.equal(
    notes,
    `**feat**
 - editor: add project colors

**fix**
 - desktop: stabilize Wayland

**display**
 - canvas: improve bead contrast

**perf**
 - redraw dirty rectangles

**docs**
 - explain package installation

**Full Changelog**: [v1.0.1...v1.0.2](https://github.com/EulCau/PerlerDrawing/compare/v1.0.1...v1.0.2)
`,
  );
});

test("uses a commit history link for the first release", () => {
  assert.equal(
    renderReleaseNotes({
      subjects: ["chore: prepare release"],
      currentTag: "v1.0.0",
      previousTag: "",
      repository: "EulCau/PerlerDrawing",
    }),
    "**Full Changelog**: [v1.0.0](https://github.com/EulCau/PerlerDrawing/commits/v1.0.0)\n",
  );
});
