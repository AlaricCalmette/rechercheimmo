import { logout } from "./actions";

// Barre de navigation commune à toutes les pages du site.
export function Nav({
  active,
}: {
  active: "annonces" | "candidats" | "profil" | "exclusions";
}) {
  const link = (href: string, key: typeof active, label: string) => (
    <a className={`nav-link${active === key ? " active" : ""}`} href={href}>
      {label}
    </a>
  );
  return (
    <div className="topbar">
      <a className="brand" href="/">
        🏠 RechercheImmo
      </a>
      <nav>
        {link("/", "annonces", "Mes annonces")}
        {link("/candidats", "candidats", "Candidats")}
        {link("/profil", "profil", "Profils")}
        {link("/exclusions", "exclusions", "Exclusions")}
      </nav>
      <form action={logout}>
        <button className="logout" type="submit">
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
