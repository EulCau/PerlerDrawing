import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./i18n/config";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/start-page.css";
import "./styles/editor.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing application root element.");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
