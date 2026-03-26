/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        green: { DEFAULT: "#22c55e", dark: "#16a34a", light: "#f0fdf4" },
        navy: "#0f2744",
      },
      fontFamily: {
        display: ["Bricolage Grotesque", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
