import express from "express";
import type { Logger } from "pino";
import type { ShowMediaFileStore } from "./files.js";
import { renderYoutubePlayerPage } from "./youtube-page.js";

// Hizuri (Show window, media): the two public daemon routes under SHOW_MEDIA_ROUTE. Mounted
// before daemon auth (see files.ts and youtube-page.ts for why each one may be public).

export function createShowMediaRouter(input: {
  files: ShowMediaFileStore;
  logger: Logger;
}): express.Router {
  const router = express.Router();
  const page = renderYoutubePlayerPage();

  router.get("/youtube", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.send(page);
  });

  // The name segment is only there so players can read the container from the extension.
  router.get("/file/:token/:name", (req, res) => {
    const absolutePath = input.files.resolve(req.params.token);
    if (!absolutePath) {
      res.status(404).json({ error: "Unknown or expired media link" });
      return;
    }
    // sendFile answers Range requests, which the phone's player needs for seeking.
    res.sendFile(absolutePath, { dotfiles: "allow", cacheControl: false }, (error) => {
      if (!error || res.headersSent) return;
      input.logger.warn({ err: error, absolutePath }, "Show media file failed");
      res.status(404).json({ error: "Media file is gone" });
    });
  });

  return router;
}
