import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/server/db";
import { createPersonalWorkspace } from "@/server/services/workspace";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : {};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders: google,
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  databaseHooks: { user: { create: { after: async (u) => createPersonalWorkspace(u.id, u.name.split(" ")[0] || "My") } } },
  plugins: [nextCookies()],
});
