import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    // Use relative asset paths so the build works from any subdirectory
    // (GitHub Pages project sites, itch.io uploads, etc.). Set to '/' if
    // deploying to a domain root.
    base: './',
});
