import { defineConfig } from "vite";

// Relative asset paths so the build works on ANY host:
// GitHub Pages subpath (user.github.io/repo), Cloudflare Pages root, etc.
export default defineConfig({
  base: "./",
});
