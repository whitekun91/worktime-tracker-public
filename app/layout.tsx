import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RegisterServiceWorker from "./components/RegisterServiceWorker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "출퇴근 기록",
  description: "버튼으로 출근·퇴근 시간을 기록합니다.",
  appleWebApp: {
    capable: true,
    title: "출퇴근 기록",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#047857" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased`}
    >
      <body className="flex min-h-dvh flex-col text-base">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
