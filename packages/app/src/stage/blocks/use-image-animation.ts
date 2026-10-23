import type { Image } from "expo-image";
import { type RefObject, useEffect, useRef } from "react";

/**
 * An animated picture (an animated .webp clip) decodes a frame on the CPU at its own rate for as
 * long as its view lives, on screen or not, and the Show page stays mounted while the user looks at
 * the assistant's face or the chat. It animates only while its tab is in front on the Show page
 * (`active`): pass the ref and `autoplay={active}` to the expo-image view. `autoplay` covers a
 * picture that loads while hidden; the ref starts and stops one already shown (expo-image reads
 * `autoplay` only when the picture loads).
 */
export function useImageAnimation(active: boolean): RefObject<Image | null> {
  const ref = useRef<Image | null>(null);
  useEffect(() => {
    const image = ref.current;
    if (!image) return;
    (active ? image.startAnimating() : image.stopAnimating()).catch(() => {});
  }, [active]);
  return ref;
}
