import { defineTheme } from "../define";

/** The game's own looks: aged parchment by day, a moonlit deck by night. */
export default [
  defineTheme({
    id: "pirate-parchment",
    name: "Parchment",
    description: "Aged treasure-map paper, ink and sealing wax.",
    scheme: "light",
    colors: {
      canvas: "#EFE3C8",
      surface: "#F8F0DC",
      surfaceHover: "#F0E4C6",
      border: "#D3BF94",
      textPrimary: "#2E2112",
      textSecondary: "#5C4A31",
      textMuted: "#7F6B4E",
      accent: "#9E2B25",
      success: "#2F7D3B",
      warning: "#A86A00",
      danger: "#B3261E",
    },
    radius: { control: "0.6rem", tile: "0.8rem", card: "1.1rem" },
    shadow: {
      card: "0 1px 2px rgb(60 40 10 / 0.10), 0 4px 14px -6px rgb(60 40 10 / 0.25)",
      overlay: "0 12px 40px -8px rgb(60 40 10 / 0.35)",
    },
    effects: {
      canvasImage:
        "radial-gradient(ellipse at 20% 0%, rgb(255 250 235 / 0.8), transparent 60%), radial-gradient(ellipse at 100% 100%, rgb(160 120 60 / 0.25), transparent 55%)",
    },
  }),
  defineTheme({
    id: "pirate-sea",
    name: "Midnight Sea",
    description: "A moonlit deck over deep teal waters, lantern gold.",
    scheme: "dark",
    colors: {
      canvas: "#07161C",
      surface: "#0E242C",
      surfaceHover: "#143039",
      border: "#21434D",
      textPrimary: "#ECE4D0",
      textSecondary: "#B2AE9C",
      textMuted: "#7D8A86",
      accent: "#E3B04B",
      success: "#5CC98A",
      warning: "#F0B44C",
      danger: "#F07166",
    },
    radius: { control: "0.6rem", tile: "0.8rem", card: "1.1rem" },
    shadow: {
      card: "0 1px 2px rgb(0 0 0 / 0.3), 0 6px 20px -8px rgb(0 0 0 / 0.6)",
      overlay: "0 16px 48px -8px rgb(0 0 0 / 0.7)",
    },
    effects: {
      canvasImage:
        "radial-gradient(ellipse at 80% -10%, rgb(227 176 75 / 0.12), transparent 50%), radial-gradient(ellipse at 0% 100%, rgb(20 90 110 / 0.35), transparent 60%)",
    },
  }),
];
