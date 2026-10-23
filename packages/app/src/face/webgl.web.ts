/**
 * True when this browser lets the page draw WebGL 2, which the assistant's three.js page needs.
 * LibreWolf ships WebGL behind a per-site permission (`librewolf.webgl.prompt`): until the user
 * allows it, a context comes back null, the avatar page throws, and the face would load forever.
 * The test context is dropped at once, so it holds no GPU memory.
 */
export function canDrawFace(): boolean {
  if (typeof document === "undefined") return false;
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return false;
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}
