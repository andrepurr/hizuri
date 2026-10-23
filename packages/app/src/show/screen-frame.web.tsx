import type { ShowScreenFrameProps } from "./screen-frame";

// The live stream of the agent's browser in an iframe. The stream page lives on its own origin,
// so `allow-same-origin` gives it only its own storage, never the app's; it may not navigate the
// app or open windows. `autoplay` lets its WebRTC video and sound start without a second tap.
// Its watch-only touch-gamepad toggle stays: a cross-origin page cannot be restyled from here.
const SANDBOX = "allow-scripts allow-same-origin";
const ALLOW = "autoplay; fullscreen";

const iframeStyle = {
  flex: 1,
  width: "100%",
  height: "100%",
  minHeight: 0,
  border: "none",
  backgroundColor: "#000",
} as const;

export function ShowScreenFrame({ url, title, testID }: ShowScreenFrameProps) {
  return (
    <iframe
      data-testid={testID}
      title={title}
      src={url}
      sandbox={SANDBOX}
      allow={ALLOW}
      referrerPolicy="no-referrer"
      style={iframeStyle}
    />
  );
}
