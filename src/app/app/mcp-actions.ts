"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { createToken, revokeToken } from "@/server/mcp/tokens";
import { EXPIRY_CHOICES } from "@/lib/mcp-token";

export type TokenState = { error?: string; token?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Give the token a name").max(60),
  days: z.coerce.number().refine((d) => (EXPIRY_CHOICES as readonly number[]).includes(d), "Pick one of the lifetimes"),
});

/** The plaintext token is shown once, in this response, and never stored. */
export async function createTokenAction(_: TokenState, fd: FormData): Promise<TokenState> {
  const { user } = await requireWorkspace();
  const p = schema.safeParse({ name: fd.get("name"), days: fd.get("days") });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  try {
    const token = await createToken(user.id, p.data.name, fd.get("write") === "on", p.data.days);
    revalidatePath("/app", "layout");
    return { token };
  } catch (e) { return { error: e instanceof Error ? e.message : "Could not create the token" }; }
}

export async function revokeTokenAction(id: string) {
  const { user } = await requireWorkspace();
  await revokeToken(user.id, id);
  revalidatePath("/app", "layout");
}
