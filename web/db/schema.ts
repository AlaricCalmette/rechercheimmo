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
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
