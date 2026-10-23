# The face's mouth

The avatar page draws the mouth from the voice the app plays. You have three options for what drives it.

1. **The plain mouth.** Nothing to install. For every 20 ms of voice the app sends a frame: the loudness, which opens the mouth, and five vowel weights guessed from the brightness of the sound (`packages/app/src/face/mouth.ts`). It follows the rhythm of speech; it does not know which sound plays.
2. **Your own mouth model.** Put it in your avatar folder and let the page run it on the voice itself. The format is below.
3. **A hosted hizuri server.** Its avatar folder already carries a trained mouth model. Pair the app with that server's daemon and the face uses it; you install nothing.

## Bring your own model

The daemon serves your avatar folder at `/avatar/` (`features.face.avatarDir` in the daemon config, or `PASEO_FACE_AVATAR_DIR`). Your model is any code your page loads from that folder, so you install it by copying its files there. The app opens the page with `?host=app`. In the app's WebView it calls `window.__hizuriFace(message)`, which your page defines; in the web app's iframe the same messages arrive as `message` events from `parent`. The messages are typed in `packages/app/src/face/bridge.ts`.

1. Ask for the voice. After your first drawn frame, post `{ "type": "face.ready", "audio": "pcm16" }` to the app (`window.ReactNativeWebView.postMessage(JSON.stringify(message))` in the app's WebView, `parent.postMessage(message, "*")` in the web app's iframe). The app reads the latest `face.ready`, so a page you navigate to inside the face window asks again, or not.
2. Read each chunk. Every `face.voice` message then carries:
   - `pcm`: the chunk as 16-bit little-endian mono PCM, base64;
   - `sampleRate`: its rate in Hz;
   - `audibleAt`: `Date.now()` on the phone when the chunk's first sample is heard;
   - `frames`, `frameMs`: the plain mouth's frames for the same chunk, which you may ignore.
3. Keep state across chunks and start fresh on `face.stop`. Chunks of one reply arrive in order; `face.stop` means the voice was cut off, and the next chunk begins a new stream.
4. Time your mouth by `audibleAt`, not by when the message arrived. Draw 100 to 150 ms ahead of the sound: a mouth that lags is noticed from 45 ms, one that leads only from 125 ms.

If you emit frames in the plain mouth's format (per frame: openness 0 to 1, then the weights of A, I, U, E, O), a page written for the plain mouth draws them unchanged.

Decoding a chunk in the page:

```js
function samplesOf(message) {
  const bytes = Uint8Array.from(atob(message.pcm), (c) => c.charCodeAt(0));
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1); // the phone is little-endian
}
```

The PCM costs about 64 KB of base64 per second of voice over the bridge, and your model runs in the WebView, which has a JIT. Keep it under a few milliseconds per second of audio on a mid-range phone; the WebView shares its process with the app that plays the voice.
