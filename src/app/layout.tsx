import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Cava · Punto de venta",
  description:
    "Punto de venta para distribuidor independiente de vinos y piscos Hacienda del Abuelo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
