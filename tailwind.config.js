/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        outfit: ["Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        primary: "#1A63BC",
        muted: "#4B4B4B",
        page: "#F2F2F7",
        card: "#FFFFFF",
        border: "#ECECEC",
      },
      boxShadow: {
        soft: "0px 3.64486px 44.9229px rgba(0, 0, 0, 0.05)",
        card: "0 0 12px rgba(75, 75, 75, 0.05)",
        inset2: "inset 0px 2px 2px rgba(155, 151, 151, 0.2)",
      },
      screens: {
        'xs': '475px',
      },
      borderRadius: {
        figma: '20px',
      }
    },
  },
  plugins: [],
}