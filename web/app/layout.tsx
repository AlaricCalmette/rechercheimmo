import type { Metadata } from "next";
import "./globals.css";
import { CompareProvider } from "./CompareKit";

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
      <body>
        <CompareProvider>{children}</CompareProvider>
      </body>
    </html>
  );
}
