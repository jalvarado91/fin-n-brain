import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "configure-response-headers",
      configureServer: (server) => {
        // We need these so that we can puth stockfish on a Worker
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          next();
        });
      },
    },
  ],
});

// // In standalone plugin form with preview server just in case
// // https://github.com/vitejs/vite/issues/9864#issuecomment-1232047847
// function crossOriginIsolationMiddleware(_, response, next) {
//   response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
//   response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
//   next();
// }

// const crossOriginIsolation = {
//   name: "cross-origin-isolation",
//   configureServer: (server) => {
//     server.middlewares.use(crossOriginIsolationMiddleware);
//   },
//   configurePreviewServer: (server) => {
//     server.middlewares.use(crossOriginIsolationMiddleware);
//   },
// };