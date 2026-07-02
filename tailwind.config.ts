import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050310",
        abyss: "#0B0722",
        panel: "rgba(16, 10, 42, 0.55)",
        line: "rgba(139, 108, 255, 0.16)",
        pulseblue: "#3B7BFF",
        pulseviolet: "#8B6CFF",
        pulsemagenta: "#E23FFF",
        ink: "#E8E6F5",
        dim: "#8E88AD",
      },
      fontFamily: {
        display: ["'Space Grotesk Variable'", "system-ui", "sans-serif"],
        hud: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
export default config;
