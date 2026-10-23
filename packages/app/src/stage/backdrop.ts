// The grid of the stage's backdrop field, shared by the native (Skia) and web (SVG) backdrops.

export const BACKDROP_SPACING = 22;

/** The dots of a still field covering `width` × `height`, centred, every BACKDROP_SPACING. */
export function backdropDots(width: number, height: number): [number, number][] {
  if (width <= 0 || height <= 0) return [];
  const columns = Math.floor(width / BACKDROP_SPACING);
  const rows = Math.floor(height / BACKDROP_SPACING);
  const left = (width - (columns - 1) * BACKDROP_SPACING) / 2;
  const top = BACKDROP_SPACING / 2;
  const dots: [number, number][] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      dots.push([left + column * BACKDROP_SPACING, top + row * BACKDROP_SPACING]);
    }
  }
  return dots;
}
