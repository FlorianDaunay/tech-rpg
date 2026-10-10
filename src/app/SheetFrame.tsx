/**
 * One frame of a 3×4 character sheet (Pipoya layout: 32 px frames, row 0 = facing down), drawn crisp.
 * Frame 1 = standing, facing the viewer.
 */
export function SheetFrame({ assetKey, size = 64, frame = 1 }: { assetKey: string; size?: number; frame?: number }) {
  const scale = size / 32;
  return (
    <div style={{ width: size, height: size }} aria-hidden>
      <div
        style={{
          width: 32,
          height: 32,
          backgroundImage: `url(assets/${assetKey}.png)`,
          backgroundPosition: `-${(frame % 3) * 32}px -${Math.floor(frame / 3) * 32}px`,
          imageRendering: "pixelated",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}
