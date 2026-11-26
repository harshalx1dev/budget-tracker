import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/server/db";
import { createPersonalWorkspace } from "@/server/services/workspace";
import { isAdminEmail } from "@/server/admin-bootstrap";

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
  // The role is never an input: it comes from ADMIN_EMAILS only.
  user: { additionalFields: { role: { type: "string", defaultValue: "user", input: false } } },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => ({ data: { ...u, role: isAdminEmail(u.email) ? "admin" : "user" } }),
        after: async (u) => createPersonalWorkspace(u.id, u.name.split(" ")[0] || "My"),
      },
    },
  },
  plugins: [nextCookies()],
});
