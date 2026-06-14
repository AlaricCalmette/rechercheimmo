import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

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
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;

// Annonces candidates trouvées par le skill Claude (routine de recherche).
// Chaque exécution du skill partage un même runId, ce qui permet d'afficher
// le dernier passage et de garder un historique.
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;

// Forme du profil de goût déduit et affiné par le skill au fil des passages.
export type ProfileData = {
  version?: number;
  updatedAt?: string;
  budget?: { min: number | null; max: number | null };
  locations?: string[];
  propertyTypes?: string[];
  surface?: { min: number | null; max: number | null };
  rooms?: { min: number | null; max: number | null };
  preferences?: { theme: string; weight: number; sources?: string[] }[];
  repulsions?: { theme: string; weight: number; redhibitory?: boolean }[];
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

// Profil de goût persistant du skill (mémoire entre exécutions). Table à une
// seule ligne (id = "default") : le skill le lit, l'affine, le réécrit ; le site
// l'affiche en lecture seule sur /profil.
export const profile = pgTable("profile", {
  id: text("id").primaryKey().default("default"),
  data: jsonb("data").$type<ProfileData>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Profile = typeof profile.$inferSelect;
