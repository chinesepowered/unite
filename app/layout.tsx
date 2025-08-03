import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "United | 1inch Hackathon",
  description: "Cross-chain atomic swaps between Ethereum and Monad, Tron, Sui, Stellar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        {children}
      </body>
    </html>
  );
}