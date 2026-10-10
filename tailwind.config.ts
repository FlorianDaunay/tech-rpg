import type { Config } from "tailwindcss";
import { tailwindThemeExtension } from "./src/themes/tailwind";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Cast: Tailwind's types reject function colours (see SKILL-theme-system).
      ...(tailwindThemeExtension() as unknown as NonNullable<Config["theme"]>),
      fontFamily: {
        ...(tailwindThemeExtension().fontFamily as Record<string, string>),
        display: ['"Cinzel"', "serif"],
        pixel: ['"Silkscreen"', "monospace"],
      },
      // Phones in landscape: little height, plenty of width.
      screens: { short: { raw: "(max-height: 520px)" } },
      keyframes: {
        fadeUp: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
        zoneBanner: {
          "0%": { opacity: "0", transform: "translateY(8px)", letterSpacing: "0.1em" },
          "18%, 75%": { opacity: "1", transform: "none" },
          "100%": { opacity: "0", transform: "translateY(-6px)" },
        },
      },
    },
  },
} satisfies Config;
