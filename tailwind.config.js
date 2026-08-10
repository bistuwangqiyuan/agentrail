/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0c1222",
        mist: "#e8eef7",
        rail: "#1f6feb",
        ember: "#c45c26",
        pine: "#0f766e",
      },
      fontFamily: {
        display: ['"Iowan Old Style"', "Palatino Linotype", "Palatino", "Songti SC", "serif"],
        sans: ['"Segoe UI"', "PingFang SC", "Noto Sans SC", "sans-serif"],
        mono: ['"Cascadia Code"', "Consolas", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};
