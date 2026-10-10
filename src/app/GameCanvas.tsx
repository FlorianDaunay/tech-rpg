import { useEffect, useRef } from "react";
import type Phaser from "phaser";

/** Mounts the Phaser game once (lazy-loaded so the menu paints before the engine downloads). */
export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: Phaser.Game | undefined;
    let cancelled = false;
    void import("@/game/PhaserGame").then(({ createGame }) => {
      if (!cancelled && host.current) game = createGame(host.current);
    });
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return <div ref={host} className="absolute inset-0" aria-hidden />;
}
