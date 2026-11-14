import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2a24",
        field: {
          50: "#eef2eb",
          100: "#e1e8dc",
          200: "#c6d3bd",
          600: "#2f6b4f",
          700: "#245640",
          800: "#1f4d3a",
          900: "#163a2b",
        },
        maize: { 400: "#e0ac2b", 500: "#c98f0f", 700: "#7a5504" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
