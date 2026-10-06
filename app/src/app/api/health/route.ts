export function GET() {
  return Response.json({ ok: true, service: "serviceflow", at: new Date().toISOString() });
}
