import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a192f",
};

export const metadata: Metadata = {
  title: "Jan Sunwai — Rajasthan Government Video Hearing Platform",
  description:
    "Official video calling platform for Jan Sunwai hearings. Enables District Collectors, SDMs, and Higher Officers to conduct live multi-party video hearings with citizens and field employees for instant grievance resolution.",
  keywords: [
    "Jan Sunwai",
    "Rajasthan",
    "Government",
    "Video Call",
    "Grievance",
    "Sampark",
    "District Collector",
    "Hearing",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Jan Sunwai",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Government Top Banner */}
        <header className="gov-banner">
          <div className="gov-banner__logo">
            <div className="gov-banner__seal">🏛️</div>
            <div>
              <div className="gov-banner__title">
                Jan Sunwai — Video Hearing Platform
              </div>
              <div className="gov-banner__subtitle">
                Government of Rajasthan • राजस्थान सरकार
              </div>
            </div>
          </div>
          <div className="gov-banner__right">
            <div className="gov-banner__status">
              <span className="gov-banner__status-dot"></span>
              System Online
            </div>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
