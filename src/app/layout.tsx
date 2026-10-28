import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { AuthProvider } from "@/context/AuthContext";

const jakarta = localFont({
  src: "../../public/fonts/plus-jakarta-sans.ttf",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Padel Indonesia | Turnamen & Live Scoring",
  description:
    "Satu tempat untuk turnamen padel, skor langsung, komunitas, dan pengelolaan pertandingan.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${jakarta.variable} h-full bg-canvas text-ink antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
