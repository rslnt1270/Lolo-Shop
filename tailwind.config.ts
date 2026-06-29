import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { loloteal: "#3CBFBF" },
    },
  },
  plugins: [],
};
export default config;
