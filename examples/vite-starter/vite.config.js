import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    // Use relative asset paths so the build works from any subdirectory
    // (GitHub Pages project sites, itch.io uploads, etc.). Set to '/' if
    // deploying to a domain root.
    base: './',
    plugins: [
        {
            // LittleJS owns global engine state (canvas, WebGL, input, RAF
            // loop), so partial HMR would leave ghost listeners and a
            // duplicate render loop. Replace HMR with a full page reload.
            name: 'littlejs-full-reload',
            handleHotUpdate({ server, modules, timestamp }) {
                // invalidate manually since returning [] skips normal HMR
                const invalidatedModules = new Set();
                for (const mod of modules)
                    server.moduleGraph.invalidateModule(mod, invalidatedModules, timestamp, true);
                server.ws.send({ type: 'full-reload' });
                return [];
            },
        },
    ],
});
