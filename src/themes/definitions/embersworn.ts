import { defineTheme } from "../define";

const fonts = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"Silkscreen", "JetBrains Mono", monospace',
};

/** The game's own looks: glassy panels over the game world, warm ember accent. */
export default [
  defineTheme({
    id: "ember-night",
    name: "Ember Night",
    description: "The default look: smoked glass, lantern-orange accent.",
    scheme: "dark",
    colors: {
      canvas: "#07060B",
      surface: "#14111CD9",
      surfaceHover: "#221C2EE6",
      border: "#3A2F4A",
      textPrimary: "#F4ECE1",
      textSecondary: "#C2B5A6",
      textMuted: "#8A7E8F",
      accent: "#FF8A3D",
      success: "#6EE7A8",
      warning: "#FFD27A",
      danger: "#FF5D6C",
    },
    radius: { control: "0.625rem", tile: "0.875rem", card: "1.25rem" },
    shadow: {
      card: "0 10px 40px -12px rgb(0 0 0 / 0.75), inset 0 1px 0 rgb(255 255 255 / 0.05)",
      overlay: "0 24px 64px -16px rgb(0 0 0 / 0.85)",
    },
    effects: { surfaceBackdrop: "blur(14px) saturate(1.3)" },
    fonts,
  }),
  defineTheme({
    id: "ember-dawn",
    name: "Ember Dawn",
    description: "Parchment and gold, for bright rooms and sunny trains.",
    scheme: "light",
    colors: {
      canvas: "#F3E9D8",
      surface: "#FBF5EAE6",
      surfaceHover: "#F1E4CDEE",
      border: "#D9C5A3",
      textPrimary: "#2A1E14",
      textSecondary: "#5C4632",
      textMuted: "#8C7559",
      accent: "#C2541B",
      success: "#2F8F5B",
      warning: "#B7791F",
      danger: "#C2364A",
    },
    radius: { control: "0.625rem", tile: "0.875rem", card: "1.25rem" },
    effects: { surfaceBackdrop: "blur(14px)" },
    fonts,
  }),
];
