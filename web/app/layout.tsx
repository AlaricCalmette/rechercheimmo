import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RechercheImmo",
  description:
    "Annonces immobilières sauvegardées, profils achat & location, candidats de la routine",
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
