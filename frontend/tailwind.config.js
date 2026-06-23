/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette — deep navy with blood-red accent
        ink:     "#0A0F1E",
        surface: "#111827",
        raised:  "#1F2937",
        border:  "#374151",
        muted:   "#6B7280",
        text:    "#F9FAFB",
        "text-dim": "#9CA3AF",
        crimson: {
          DEFAULT: "#EF4444",
          dark:    "#DC2626",
          light:   "#FCA5A5",
          glow:    "rgba(239,68,68,0.15)",
        },
        safe:  "#10B981",
        warn:  "#F59E0B",
        info:  "#3B82F6",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        pulse_slow: "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in":  "fadeIn 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: "translateY(8px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
