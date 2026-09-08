import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],

        darkMode: "class",
        theme: {
          extend: {
            "colors": {
              "surface-container": "#edeeef",
              "inverse-primary": "#5cd9d8",
              "background": "#f8f9fa",
              "surface-container-low": "#f3f4f5",
              "on-secondary-container": "#636262",
              "primary": "#006a6a",
              "on-tertiary-fixed-variant": "#773205",
              "on-primary-fixed-variant": "#004f50",
              "surface-bright": "#f8f9fa",
              "secondary-container": "#e2dfde",
              "tertiary-container": "#f69562",
              "on-tertiary-container": "#702d01",
              "on-primary-container": "#004949",
              "surface": "#f8f9fa",
              "primary-container": "#3cbfbf",
              "on-primary": "#ffffff",
              "primary-fixed-dim": "#5cd9d8",
              "error": "#ba1a1a",
              "on-surface-variant": "#3d4949",
              "outline-variant": "#bcc9c8",
              "on-primary-fixed": "#002020",
              "on-secondary-fixed-variant": "#474746",
              "primary-fixed": "#7cf5f5",
              "error-container": "#ffdad6",
              "on-background": "#191c1d",
              "surface-variant": "#e1e3e4",
              "secondary-fixed-dim": "#c8c6c5",
              "surface-dim": "#d9dadb",
              "surface-container-lowest": "#ffffff",
              "on-secondary-fixed": "#1c1b1b",
              "inverse-surface": "#2e3132",
              "secondary": "#5f5e5e",
              "on-tertiary": "#ffffff",
              "tertiary": "#95491c",
              "on-surface": "#191c1d",
              "on-secondary": "#ffffff",
              "on-error": "#ffffff",
              "tertiary-fixed": "#ffdbcb",
              "outline": "#6c7a79",
              "on-tertiary-fixed": "#341100",
              "surface-tint": "#006a6a",
              "surface-container-highest": "#e1e3e4",
              "surface-container-high": "#e7e8e9",
              "tertiary-fixed-dim": "#ffb692",
              "inverse-on-surface": "#f0f1f2",
              "secondary-fixed": "#e5e2e1",
              "on-error-container": "#93000a"
            },
            "borderRadius": {
              "DEFAULT": "1rem",
              "lg": "2rem",
              "xl": "3rem",
              "full": "9999px"
            },
            "spacing": {
              "gutter": "24px",
              "container-padding": "40px",
              "glass-padding": "32px",
              "unit": "8px"
            },
            "fontFamily": {
              "label-caps": [
                "JetBrains Mono"
              ],
              "headline-md": [
                "Plus Jakarta Sans"
              ],
              "display-lg": [
                "Plus Jakarta Sans"
              ],
              "body-base": [
                "Plus Jakarta Sans"
              ],
              "data-mono": [
                "JetBrains Mono"
              ]
            },
            "fontSize": {
              "label-caps": [
                "12px",
                {
                  "lineHeight": "1.2",
                  "letterSpacing": "0.1em",
                  "fontWeight": "700"
                }
              ],
              "headline-md": [
                "24px",
                {
                  "lineHeight": "1.3",
                  "letterSpacing": "-0.02em",
                  "fontWeight": "600"
                }
              ],
              "display-lg": [
                "48px",
                {
                  "lineHeight": "1.1",
                  "letterSpacing": "-0.04em",
                  "fontWeight": "700"
                }
              ],
              "body-base": [
                "16px",
                {
                  "lineHeight": "1.6",
                  "letterSpacing": "0em",
                  "fontWeight": "400"
                }
              ],
              "data-mono": [
                "14px",
                {
                  "lineHeight": "1.5",
                  "letterSpacing": "-0.01em",
                  "fontWeight": "500"
                }
              ]
            }
          }
        },
  plugins: [],
};
export default config;
