import { create } from "zustand";
import { bridge, type TradeView } from "@/bridge/events";
import type { TradeChange } from "@/core/trade/trade";
import { useMenu } from "./menu";

const ENDED: TradeChange[] = ["done", "cancelled", "declined", "failed"];

/** The trade the local player is in (null when none) and how the last one ended (toast). */
export const useTrade = create<{ view: TradeView | null; ended: { change: TradeChange; partnerName: string; byMe: boolean; n: number } | null }>()(() => ({ view: null, ended: null }));

bridge.on("game:trade", (v) => {
  const menu = useMenu.getState();
  if (ENDED.includes(v.change)) {
    useTrade.setState((s) => ({ view: null, ended: { change: v.change, partnerName: v.partnerName, byMe: v.by === v.me, n: (s.ended?.n ?? 0) + 1 } }));
    if (menu.stack.at(-1) === "trade") menu.back();
    return;
  }
  useTrade.setState({ view: v });
  // A request (sent or received) opens the trade window; it stays open until the trade ends.
  menu.open("trade");
});

/** Leaving the world drops any trade view (the sim ends the trade itself). */
bridge.on("game:world-ready", () => useTrade.setState({ view: null }));
