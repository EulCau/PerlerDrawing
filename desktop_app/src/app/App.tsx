import { useCallback, useEffect, useState } from "react";
import { PreferencesSync } from "./PreferencesSync";
import { documentStore, useDocumentStore } from "./document-store";
import { createProjectWorkspaceSnapshot, editorStore, useEditorStore } from "./editor-store";
import type { PatternDocument } from "../editor/model/pattern-document";
import { EditorPage } from "../features/editor/EditorPage";
import { CsvImportDialog } from "../features/csv/CsvImportDialog";
import { ImageImportPage } from "../features/image/ImageImportPage";
import { NewPatternDialog } from "../features/start/NewPatternDialog";
import { StartPage } from "../features/start/StartPage";
import {
  createPatternProjectContents,
  parsePatternProject,
  suggestedProjectFileName,
  type ProjectWorkspaceSnapshot,
} from "../features/project/project-format";
import { createProjectPreview } from "../features/project/project-preview";
import {
  chooseProjectOpenPath,
  chooseProjectSavePath,
  emptyAppUserState,
  fileNameFromPath,
  loadAppUserState,
  projectCsvPath,
  readPatternProject,
  recordExportPath,
  recordRecentProject,
  savePatternProject,
  type AppUserState,
  type RecentProject,
} from "../features/project/project-transport";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

export function App() {
  const [view, setView] = useState<"start" | "image" | "editor">("start");
  const [showNewPattern, setShowNewPattern] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [userState, setUserState] = useState<AppUserState>(emptyAppUserState);
  const [loadingUserState, setLoadingUserState] = useState(true);
  const [currentProject, setCurrentProject] = useState<RecentProject | null>(null);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [savedWorkspaceRevision, setSavedWorkspaceRevision] = useState<number | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const revision = useDocumentStore((state) => state.revision);
  const workspaceRevision = useEditorStore((state) => state.workspaceRevision);

  useEffect(() => {
    let active = true;
    void loadAppUserState()
      .then((state) => {
        if (active) setUserState(state);
      })
      .catch((error: unknown) => {
        if (active) setProjectError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingUserState(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [view]);

  const activateDocument = useCallback(
    (
      document: PatternDocument,
      project: RecentProject | null,
      workspace?: ProjectWorkspaceSnapshot,
    ) => {
      documentStore.getState().openDocument(document);
      editorStore.getState().resetForDocument(document, workspace);
      const revision = documentStore.getState().revision;
      const workspaceRevision = editorStore.getState().workspaceRevision;
      setCurrentProject(project);
      setSavedRevision(project ? revision : null);
      setSavedWorkspaceRevision(project ? workspaceRevision : null);
      setProjectError("");
      setView("editor");
    },
    [],
  );

  const openNewPattern = (document: PatternDocument) => {
    activateDocument(document, null);
    setShowNewPattern(false);
  };

  const openImportedPattern = (document: PatternDocument) => {
    activateDocument(document, null);
    setShowCsvImport(false);
  };

  const openProjectAtPath = useCallback(
    async (metadataPath: string) => {
      setOpeningProject(true);
      setProjectError("");
      try {
        const response = await readPatternProject(metadataPath);
        const opened = parsePatternProject(response.metadataContents, response.csvContents);
        const nextUserState = await recordRecentProject(
          response.project.metadataPath,
          createProjectPreview(opened.document),
        );
        const recentProject =
          nextUserState.recentProjects.find(
            (project) => project.metadataPath === response.project.metadataPath,
          ) ?? response.project;
        setUserState(nextUserState);
        activateDocument(opened.document, recentProject, opened.workspace);
      } catch (error) {
        setProjectError(errorMessage(error));
      } finally {
        setOpeningProject(false);
      }
    },
    [activateDocument],
  );

  const chooseAndOpenProject = useCallback(async () => {
    setProjectError("");
    try {
      const path = await chooseProjectOpenPath(userState.lastProjectDirectory);
      if (path) await openProjectAtPath(path);
    } catch (error) {
      setProjectError(errorMessage(error));
    }
  }, [openProjectAtPath, userState.lastProjectDirectory]);

  const saveCurrentProject = useCallback(
    async (saveAs: boolean) => {
      if (savingProject) return;
      const document = documentStore.getState().document;
      if (!document) return;
      setProjectError("");
      setSavingProject(true);
      try {
        let metadataPath = saveAs ? null : currentProject?.metadataPath;
        if (!metadataPath) {
          metadataPath = await chooseProjectSavePath(
            suggestedProjectFileName(document),
            userState.lastProjectDirectory,
          );
        }
        if (!metadataPath) return;

        const snapshotRevision = documentStore.getState().revision;
        const snapshotWorkspaceRevision = editorStore.getState().workspaceRevision;
        const csvFileName = fileNameFromPath(projectCsvPath(metadataPath));
        const workspace = createProjectWorkspaceSnapshot(document, editorStore.getState());
        const contents = createPatternProjectContents(document, csvFileName, workspace);
        const response = await savePatternProject(metadataPath, contents);
        setCurrentProject(response.project);
        setUserState(response.userState);
        setSavedRevision(snapshotRevision);
        setSavedWorkspaceRevision(snapshotWorkspaceRevision);
      } catch (error) {
        setProjectError(errorMessage(error));
      } finally {
        setSavingProject(false);
      }
    },
    [currentProject, savingProject, userState.lastProjectDirectory],
  );

  const projectIsDirty =
    currentProject === null ||
    savedRevision !== revision ||
    savedWorkspaceRevision !== workspaceRevision;

  const rememberExportPath = useCallback(async (exportPath: string) => {
    try {
      setUserState(await recordExportPath(exportPath));
    } catch {
      // The export itself remains valid when updating the convenience directory fails.
    }
  }, []);

  return (
    <>
      <PreferencesSync />
      {view === "editor" ? (
        <EditorPage
          currentProjectPath={currentProject?.metadataPath}
          isDirty={projectIsDirty}
          lastExportDirectory={userState.lastExportDirectory}
          onBack={() => setView("start")}
          onExportSaved={rememberExportPath}
          onSave={saveCurrentProject}
          saveError={projectError}
          saving={savingProject}
        />
      ) : view === "image" ? (
        <ImageImportPage onBack={() => setView("start")} onImport={openImportedPattern} />
      ) : (
        <StartPage
          onCreateBlank={() => setShowNewPattern(true)}
          onImportCsv={() => setShowCsvImport(true)}
          onImportImage={() => setView("image")}
          onOpenProject={() => void chooseAndOpenProject()}
          onOpenRecent={(path) => void openProjectAtPath(path)}
          openingProject={openingProject}
          projectError={projectError}
          recentProjects={userState.recentProjects}
          recentProjectsLoading={loadingUserState}
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
