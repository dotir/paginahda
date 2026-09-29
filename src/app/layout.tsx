import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/app/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "El Arbolito · Punto de venta",
  description:
    "Punto de venta para distribuidor independiente de vinos y piscos Hacienda del Abuelo.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#7f1d1d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
