import { NextResponse } from "next/server"

import { AuthError, ForbiddenError, ValidationError } from "@/lib/api/errors"
import { withErrorHandling } from "@/lib/api/withErrorHandling"
import { withValidation } from "@/lib/api/withValidation"
import { getDb } from "@/lib/db"
import { verifyCallerAuth } from "@/lib/walletAuth"
import { webhookUpdateBodySchema } from "@hunty/types/api-schemas"
import { z } from "zod"

const paramsSchema = z.object({ id: z.string().uuid() })

async function owner(req: Request): Promise<string> {
  const auth = await verifyCallerAuth(req as import("next/server").NextRequest)
  if (!auth.authenticated) throw new AuthError(auth.error ?? "Authentication required")
  if (!auth.authorized) throw new ForbiddenError(auth.error ?? "Forbidden")
  if (!auth.actor) throw new AuthError("Authenticated caller has no actor")
  return auth.actor
}

export const PATCH = withValidation(
  { body: webhookUpdateBodySchema, params: paramsSchema },
  async (req, _context, { body, params }) => {
    const sql = getDb()
    const address = await owner(req)
    const [webhook] = await sql`
      UPDATE webhooks SET
        url = COALESCE(${body.url ?? null}, url),
        events = COALESCE(${body.events ? sql.array(body.events) : null}, events),
        active = COALESCE(${body.active ?? null}, active), updated_at = NOW()
      WHERE id = ${params!.id} AND creator_address = ${address}
      RETURNING id, url, events, active, updated_at
    `
    if (!webhook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 })
    return NextResponse.json({ data: webhook })
  },
)

export const DELETE = withErrorHandling(async (req: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) throw new ValidationError("Invalid webhook ID")
  const sql = getDb()
  const result = await sql`DELETE FROM webhooks WHERE id = ${id} AND creator_address = ${await owner(req)}`
  if (result.count === 0) return NextResponse.json({ error: "Webhook not found" }, { status: 404 })
  return NextResponse.json({ success: true })
})
