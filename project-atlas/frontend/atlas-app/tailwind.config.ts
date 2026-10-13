import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/gis/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a1628",
        surface: "rgba(9, 16, 24, 0.97)",
        primary: "#316dca",
        "primary-hover": "#2563eb",
        accent: "#d9b451",
        sky: "#38bdf8",
        success: "#3fb950",
        danger: "#f85149",
        muted: "#adbac7",
      },
      fontFamily: {
        gothic: ['Century Gothic', 'CenturyGothic', 'AppleGothic', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
export default config;
