import type { Metadata } from "next";
import { Suspense } from "react";
import { SellerShell } from "@/components/seller/seller-shell";
import "./seller.css";

export const metadata: Metadata = { title: "Seller · Jejak", description: "Jejak seller financing sandbox" };

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><SellerShell>{children}</SellerShell></Suspense>;
}
