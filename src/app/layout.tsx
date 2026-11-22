import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Time Tracker",
  description: "Log a block of time in two taps and see where every day went.",
  appleWebApp: { capable: true, title: "Time", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0D14" },
    { media: "(prefers-color-scheme: light)", color: "#EEF1F8" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="bg-blobs" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        {children}
      </body>
    </html>
  );
}
