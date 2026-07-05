import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

// Type de projet immobilier : achat ou location. Les annonces aimées, les
// candidats et les profils sont séparés selon cet axe.
export type Kind = "achat" | "location";

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
  kind: text("kind").$type<Kind>().notNull().default("achat"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
