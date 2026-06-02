import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RechercheImmo — Mes annonces",
  description: "Annonces immobilières sauvegardées",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
