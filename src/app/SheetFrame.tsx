/** Boss sheets (`bosses/…`): one row of 96 px idle frames. Everything else: 3×4 Pipoya sheets of 32 px frames. */
const frameSizeOf = (assetKey: string) => (assetKey.startsWith("bosses/") ? 96 : 32);

/**
 * One frame of a character sheet (3 columns; row 0 = facing down), drawn crisp and scaled to fit `size`.
 * Frame 1 = standing, facing the viewer (for a boss: the middle idle frame).
 */
export function SheetFrame({ assetKey, size = 64, frame = 1 }: { assetKey: string; size?: number; frame?: number }) {
  const px = frameSizeOf(assetKey);
  const scale = size / px;
  return (
    <div style={{ width: size, height: size }} aria-hidden>
      <div
        style={{
          width: px,
          height: px,
          backgroundImage: `url(assets/${assetKey}.png)`,
          backgroundPosition: `-${(frame % 3) * px}px -${Math.floor(frame / 3) * px}px`,
          imageRendering: "pixelated",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}
