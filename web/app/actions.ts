"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings } from "@/db/schema";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password !== process.env.SITE_PASSWORD) {
    redirect("/login?error=1");
  }
  const token = await expectedToken();
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}

export async function deleteListing(formData: FormData) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (token !== (await expectedToken())) {
    redirect("/login");
  }
  const id = String(formData.get("id") ?? "");
  if (id) {
    await db.delete(listings).where(eq(listings.id, id));
    revalidatePath("/");
  }
}
