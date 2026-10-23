import path from "node:path";
import express from "express";

// Hizuri: Zuri's avatar page (window 1, the face), served from a folder on this
// machine (features.face.avatarDir). The app loads it on the daemon's own origin, so the phone
// needs no tunnel and no secure context: the app feeds the mouth from the audio it already plays,
// and the page itself never touches audio. Public like the web UI files, because a WebView or an
// iframe cannot attach the daemon password to the page's own requests.
export const FACE_AVATAR_ROUTE = "/avatar";

/**
 * The folders of the avatar page, in lookup order. Like PATH, the setting may list several
 * folders joined by the platform's delimiter (":" here): a personal data folder first (the face's
 * clips, models, pages), then the shared page code. A file is served from the first folder that
 * has it, the same order the voice relay's own /avatar/ uses.
 */
export function faceAvatarDirs(avatarDir: string): string[] {
  return avatarDir
    .split(path.delimiter)
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
}

export function createFaceAvatarRouter(input: { avatarDir: string }): express.Router {
  const router = express.Router();
  // The page loads its files by relative paths, so it must be opened with the trailing slash.
  router.get("/", (req, res, next) => {
    if (req.originalUrl.split("?")[0] !== FACE_AVATAR_ROUTE) {
      next();
      return;
    }
    const query = req.originalUrl.slice(FACE_AVATAR_ROUTE.length);
    res.redirect(302, `${FACE_AVATAR_ROUTE}/${query}`);
  });
  const dirs = faceAvatarDirs(input.avatarDir);
  dirs.forEach((dir, index) => {
    router.use(
      express.static(dir, {
        // Revalidate every time: a model switch re-points model.vrm, and an unchanged file costs
        // one 304. The page keeps the 23 MB model in IndexedDB and checks this ETag with a HEAD.
        etag: true,
        lastModified: true,
        cacheControl: false,
        dotfiles: "ignore",
        // Only the last folder answers a missing file with 404; the others pass it on.
        fallthrough: index < dirs.length - 1,
        setHeaders: (res) => {
          res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
  });
  return router;
}
