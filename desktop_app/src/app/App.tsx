import { useEffect, useState } from "react";
import { PreferencesSync } from "./PreferencesSync";
import { documentStore } from "./document-store";
import { editorStore } from "./editor-store";
import type { PatternDocument } from "../editor/model/pattern-document";
import { EditorPage } from "../features/editor/EditorPage";
import { CsvImportDialog } from "../features/csv/CsvImportDialog";
import { ImageImportPage } from "../features/image/ImageImportPage";
import { NewPatternDialog } from "../features/start/NewPatternDialog";
import { StartPage } from "../features/start/StartPage";

export function App() {
  const [view, setView] = useState<"start" | "image" | "editor">("start");
  const [showNewPattern, setShowNewPattern] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [view]);

  const openNewPattern = (document: PatternDocument) => {
    documentStore.getState().openDocument(document);
    editorStore.getState().resetForDocument();
    setShowNewPattern(false);
    setView("editor");
  };

  const openImportedPattern = (document: PatternDocument) => {
    documentStore.getState().openDocument(document);
    editorStore.getState().resetForDocument();
    setShowCsvImport(false);
    setView("editor");
  };

  return (
    <>
      <PreferencesSync />
      {view === "editor" ? (
        <EditorPage onBack={() => setView("start")} />
      ) : view === "image" ? (
        <ImageImportPage onBack={() => setView("start")} onImport={openImportedPattern} />
      ) : (
        <StartPage
          onCreateBlank={() => setShowNewPattern(true)}
          onImportCsv={() => setShowCsvImport(true)}
          onImportImage={() => setView("image")}
        />
      )}
      {showNewPattern ? (
        <NewPatternDialog onCancel={() => setShowNewPattern(false)} onCreate={openNewPattern} />
      ) : null}
      {showCsvImport ? (
        <CsvImportDialog onCancel={() => setShowCsvImport(false)} onImport={openImportedPattern} />
      ) : null}
    </>
  );
}
