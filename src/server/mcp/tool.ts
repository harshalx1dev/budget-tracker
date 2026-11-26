import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { hasScope, type McpScope } from "@/lib/mcp-token";
import { logCall, type McpAuth } from "./tokens";

/** An error whose message is safe to show the agent. Unexpected errors are only logged server-side. */
export class ToolError extends Error {}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

type Def<Shape extends z.ZodRawShape> = { name: string; title: string; description: string; scope: McpScope; input: Shape };

/**
 * Registers a tool behind the checks every tool needs: the token must hold the scope, every call is logged (rate limit
 * and audit trail), and errors become tool errors. The workspace is always the token owner's; it is never an input.
 */
export function tool<Shape extends z.ZodRawShape>(server: McpServer, auth: McpAuth, def: Def<Shape>, run: (args: z.infer<z.ZodObject<Shape>>, auth: McpAuth) => Promise<unknown>) {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      // Write tools only ever add; nothing here edits or deletes.
      annotations: { readOnlyHint: def.scope === "read", destructiveHint: false, openWorldHint: false },
    },
    (async (args: unknown): Promise<ToolResult> => {
      if (!hasScope(auth.scopes, def.scope)) {
        await logCall(auth.tokenId, def.name, false);
        return fail("This token is read-only. Create a token with write access in the app's settings to add data.");
      }
      try {
        const out = await run(args as z.infer<z.ZodObject<Shape>>, auth);
        await logCall(auth.tokenId, def.name, true);
        return ok(out);
      } catch (e) {
        await logCall(auth.tokenId, def.name, false);
        if (e instanceof ToolError) return fail(e.message);
        console.error(`mcp tool ${def.name} failed`, e);
        return fail("Something went wrong on the server. Try again.");
      }
    }) as never,
  );
}
