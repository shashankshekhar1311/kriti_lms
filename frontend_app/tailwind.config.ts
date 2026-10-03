import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        drona: {
          emerald: "#50C878",
          cyan: "#00FFFF",
          amber: "#FFBF00",
          rose: "#E11D48",
          ink: "#111111",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "IBM Plex Sans", "sans-serif"],
        display: ["var(--font-display)", "Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
