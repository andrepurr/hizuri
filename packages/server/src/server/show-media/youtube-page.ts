// Hizuri (Show window, media): the page the app's WebView loads to play YouTube (lane 2). It is
// served by the daemon from a real http(s) address on purpose: YouTube refuses to play in an
// inline page with no Referer (errors 152/153), and the daemon origin is one the phone already
// reaches. The page holds no secrets, so it sits before daemon auth like the web UI files.
//
// Bridge (mirrored in packages/app/src/show-media/youtube-bridge.ts — keep the two in step):
//   in  (app → page): window.hizuriMedia.receive(message), or a postMessage from the parent frame
//       { type: "media.command", command: MediaCommand }
//   out (page → app): ReactNativeWebView.postMessage(JSON) on Android, parent.postMessage on web
//       { type: "media.ready" } | { type: "media.state", state } | { type: "media.error", code }
//       | { type: "media.time", seconds } (every 5 s while playing, so the app can resume there)
// The first video comes from the query string: ?v=<id>&list=<playlist>&start=<s>&queue=<id,id>;
// &autoplay=0 loads it paused (the player tab restored after the app restarted).

const PAGE_SCRIPT = String.raw`
(function () {
  var params = new URLSearchParams(location.search);
  var idPattern = /^[A-Za-z0-9_-]{11}$/;
  var listPattern = /^[A-Za-z0-9_-]{10,64}$/;
  var videoId = idPattern.test(params.get("v") || "") ? params.get("v") : null;
  var list = listPattern.test(params.get("list") || "") ? params.get("list") : null;
  var start = Math.max(0, Math.floor(Number(params.get("start")) || 0));
  var autoplay = params.get("autoplay") !== "0";
  var queue = (params.get("queue") || "").split(",").filter(function (id) {
    return idPattern.test(id);
  });
  var player = null;
  var pending = [];

  function send(message) {
    var text = JSON.stringify(message);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(text);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(text, "*");
    }
  }

  var STATES = { "-1": "unstarted", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "cued" };

  function apply(command) {
    if (!player) {
      pending.push(command);
      return;
    }
    switch (command.action) {
      case "play":
        player.playVideo();
        break;
      case "pause":
        player.pauseVideo();
        break;
      case "stop":
        player.stopVideo();
        break;
      case "next":
        player.nextVideo();
        break;
      case "previous":
        player.previousVideo();
        break;
      case "seek": {
        var target =
          typeof command.position === "number"
            ? command.position
            : player.getCurrentTime() + (Number(command.offset) || 0);
        player.seekTo(Math.max(0, target), true);
        break;
      }
      case "volume":
        player.setVolume(command.volume);
        if (command.volume > 0) player.unMute();
        else player.mute();
        break;
    }
  }

  window.hizuriMedia = {
    receive: function (message) {
      if (message && message.type === "media.command" && message.command) apply(message.command);
    },
  };
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent || typeof event.data !== "string") return;
    try {
      window.hizuriMedia.receive(JSON.parse(event.data));
    } catch (error) {
      // Not a bridge message.
    }
  });

  window.onYouTubeIframeAPIReady = function () {
    var playerVars = {
      autoplay: autoplay ? 1 : 0,
      playsinline: 1,
      rel: 0,
      fs: 1,
      enablejsapi: 1,
      origin: location.origin,
    };
    if (start > 0) playerVars.start = start;
    if (list) {
      playerVars.listType = "playlist";
      playerVars.list = list;
    }
    if (queue.length > 0) playerVars.playlist = queue.join(",");
    new YT.Player("player", {
      width: "100%",
      height: "100%",
      videoId: videoId || undefined,
      playerVars: playerVars,
      events: {
        onReady: function (event) {
          player = event.target;
          if (autoplay) player.playVideo();
          setInterval(function () {
            if (player.getPlayerState() === 1) {
              send({ type: "media.time", seconds: Math.floor(player.getCurrentTime()) });
            }
          }, 5000);
          send({ type: "media.ready" });
          pending.splice(0).forEach(apply);
        },
        onStateChange: function (event) {
          send({ type: "media.state", state: STATES[event.data] || "unknown" });
        },
        onError: function (event) {
          send({ type: "media.error", code: event.data });
        },
      },
    });
  };
})();
`;

export function renderYoutubePlayerPage(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>hizuri · YouTube</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #player { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<div id="player"></div>
<script>${PAGE_SCRIPT}</script>
<script src="https://www.youtube.com/iframe_api"></script>
</body>
</html>
`;
}
