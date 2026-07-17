import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { JejakProvider } from "@/lib/jejak/provider";
import { DemoToolbar } from "@/components/jejak/demo-toolbar";
import { TourProvider } from "@/components/tour/TourProvider";
import { TourOverlay } from "@/components/tour/TourOverlay";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = { title: "Jejak — Get your marketplace earnings sooner", description: "Jejak funds marketplace earnings that have been earned but not yet paid out, with clear evidence before every decision." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}><body><TourProvider><JejakProvider><DemoToolbar />{children}<TourOverlay /></JejakProvider></TourProvider></body></html>;
}
