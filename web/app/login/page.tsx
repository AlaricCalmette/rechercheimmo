import { login } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <form className="login-card" action={login}>
        <h1>RechercheImmo</h1>
        {error && <div className="error">Mot de passe incorrect.</div>}
        <input
          type="password"
          name="password"
          placeholder="Mot de passe"
          autoFocus
          required
        />
        <button className="primary" type="submit">
          Entrer
        </button>
      </form>
    </div>
  );
}
