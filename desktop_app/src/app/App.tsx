import { useState } from "react";
import { PreferencesSync } from "./PreferencesSync";
import { documentStore } from "./document-store";
import { editorStore } from "./editor-store";
import type { PatternDocument } from "../editor/model/pattern-document";
import { EditorPage } from "../features/editor/EditorPage";
import { NewPatternDialog } from "../features/start/NewPatternDialog";
import { StartPage } from "../features/start/StartPage";

export function App() {
  const [view, setView] = useState<"start" | "editor">("start");
  const [showNewPattern, setShowNewPattern] = useState(false);

  const openNewPattern = (document: PatternDocument) => {
    documentStore.getState().openDocument(document);
    editorStore.getState().resetForDocument();
    setShowNewPattern(false);
    setView("editor");
  };

  return (
    <>
      <PreferencesSync />
      {view === "editor" ? (
        <EditorPage onBack={() => setView("start")} />
      ) : (
        <StartPage onCreateBlank={() => setShowNewPattern(true)} />
      )}
      {showNewPattern ? (
        <NewPatternDialog onCancel={() => setShowNewPattern(false)} onCreate={openNewPattern} />
      ) : null}
    </>
  );
}
