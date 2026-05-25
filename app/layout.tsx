import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TODO App",
  description: "A simple TODO application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.className} min-h-screen bg-primary-50 text-primary-900 antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
