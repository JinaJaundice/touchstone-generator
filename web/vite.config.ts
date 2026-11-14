import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Vite 8 builds for Chrome 111, Edge 111, Firefox 114 and Safari 16.4 where no target is set. This list is the
  // target that Vite 5 built for, so the built page reads on the same browsers as it did before the update.
  build: { target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"] },
  server: { port: 5178, strictPort: true },
});
