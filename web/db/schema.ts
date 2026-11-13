import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  doublePrecision,
} from "drizzle-orm/pg-core";

// Type de projet immobilier : achat ou location. Les annonces aimées, les
// candidats et les profils sont séparés selon cet axe.
export type Kind = "achat" | "location";

// Statut de suivi d'une annonce sauvegardée (pipeline de recherche).
export type ListingStatus =
  | "a_contacter"
  | "contactee"
  | "visite_prevue"
  | "visitee"
  | "ecartee";

// Un point d'historique de prix : le prix que portait l'annonce AVANT le
// changement détecté à cette date (voir /api/listings/check).
export type PricePoint = { date: string; price: number };

export const listings = pgTable("listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: text("source").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  price: integer("price"),
  location: text("location"),
  surface: text("surface"),
  rooms: text("rooms"),
  description: text("description"),
  photos: jsonb("photos").$type<string[]>().default([]),
  notes: text("notes"),
  dislikes: text("dislikes"),
  kind: text("kind").$type<Kind>().notNull().default("achat"),
  // Suivi de la recherche : null = pas encore de statut.
  status: text("status").$type<ListingStatus>(),
  // Veille : anciens prix détectés par la routine, date du dernier contrôle,
  // et drapeau « annonce disparue » (vendue/retirée du portail).
  priceHistory: jsonb("price_history").$type<PricePoint[]>(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  gone: boolean("gone").default(false),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;

// Annonces candidates trouvées par le skill Claude (routine de recherche).
// Chaque exécution du skill partage un même runId, ce qui permet d'afficher
// le dernier passage et de garder un historique. Chaque candidat porte un
// `kind` : la routine produit une liste achat ET une liste location.
export const candidates = pgTable("candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").notNull(),
  source: text("source").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  price: integer("price"),
  location: text("location"),
  surface: text("surface"),
  rooms: text("rooms"),
  photos: jsonb("photos").$type<string[]>().default([]),
  score: integer("score"),
  reasons: text("reasons"),
  // Détail du score par trait : points positifs ou négatifs attribués par la
  // routine (ex. { label: "pierre apparente", points: 12 }).
  scoreDetails: jsonb("score_details").$type<ScorePoint[]>(),
  kind: text("kind").$type<Kind>().notNull().default("achat"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ScorePoint = { label: string; points: number };

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;

// Un passage de la routine : statistiques d'insertion renvoyées par
// POST /api/candidates. Si un même runId envoie plusieurs lots (achat puis
// location), les compteurs s'additionnent.
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey(),
  received: integer("received").notNull().default(0),
  inserted: integer("inserted").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  blacklisted: integer("blacklisted").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Run = typeof runs.$inferSelect;

// Cache de géocodage (carte) : une ligne par texte de localisation rencontré.
// lat/lng null = géocodage tenté mais sans résultat (on ne réessaie pas).
export const geocache = pgTable("geocache", {
  location: text("location").primaryKey(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Annonces exclues définitivement : leur URL ne doit plus jamais réapparaître
// dans les candidats. Alimentée par le bouton « Exclure » du site ; consultée
// par l'API candidates (filtre à l'insertion) et par le skill (filtre à la
// recherche).
export const blacklist = pgTable("blacklist", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull().unique(),
  title: text("title"),
  source: text("source"),
  reason: text("reason"),
  // Ce que l'on savait du bien au moment de l'exclusion (type, prix, lieu,
  // surface, score…) : la routine s'en sert comme exemple négatif.
  snapshot: jsonb("snapshot").$type<BlacklistSnapshot>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type BlacklistSnapshot = {
  kind?: Kind;
  price?: number | null;
  location?: string | null;
  surface?: string | null;
  rooms?: string | null;
  score?: number | null;
  reasons?: string | null;
  scoreDetails?: ScorePoint[] | null;
  notes?: string | null;
  dislikes?: string | null;
};

export type BlacklistEntry = typeof blacklist.$inferSelect;
export type NewBlacklistEntry = typeof blacklist.$inferInsert;

// Forme du profil de goût, déduit et affiné par le skill au fil des passages,
// et éditable par l'utilisateur depuis la page /profil du site.
// - `weight` (1-5) exprime l'importance d'un trait ; 5 = essentiel.
// - `pinned: true` = trait fixé par l'utilisateur : le skill le conserve tel
//   quel (thème et poids), il ne peut ni le supprimer ni le repondérer.
// - `instructions` = consignes libres de l'utilisateur, prioritaires sur les
//   inférences du skill.
export type ProfileData = {
  version?: number;
  updatedAt?: string;
  budget?: { min: number | null; max: number | null };
  locations?: string[];
  propertyTypes?: string[];
  surface?: { min: number | null; max: number | null };
  rooms?: { min: number | null; max: number | null };
  // Plan de financement (profil achat) : sert à estimer une mensualité sur
  // chaque carte. taux = taux annuel en %, duree en années.
  financing?: {
    apport: number | null;
    taux: number | null;
    duree: number | null;
  };
  instructions?: string;
  preferences?: {
    theme: string;
    weight: number;
    pinned?: boolean;
    sources?: string[];
  }[];
  repulsions?: {
    theme: string;
    weight: number;
    redhibitory?: boolean;
    pinned?: boolean;
  }[];
  analyzedListings?: Record<
    string,
    {
      analyzedAt?: string;
      photoFindings?: string[];
      notesThemes?: string[];
      dislikeThemes?: string[];
    }
  >;
};

// Profils de goût persistants (mémoire du skill + édition utilisateur).
// Une ligne par type de projet : id = "achat" ou "location". (L'ancien id
// "default" est traité comme le profil achat historique, en lecture.)
export const profile = pgTable("profile", {
  id: text("id").primaryKey().default("default"),
  data: jsonb("data").$type<ProfileData>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Profile = typeof profile.$inferSelect;
