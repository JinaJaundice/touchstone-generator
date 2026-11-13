import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/bitter";
import "@fontsource-variable/archivo/wdth.css";
import "../styles.css";
import GeneratorApp from "./GeneratorApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GeneratorApp />
  </React.StrictMode>,
);
