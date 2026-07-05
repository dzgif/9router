import { NextResponse } from "next/server";
import { getProviderConnections, createProviderConnection } from "@/lib/localDb";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const CONNECTION_FIELDS = [
  "accessToken", "refreshToken", "expiresAt", "tokenType",
  "scope", "apiKey", "idToken", "lastRefreshAt", "expiresIn",
  "displayName", "email",
];

function sanitizeForExport(conn) {
  const out = { provider: conn.provider, authType: conn.authType, email: conn.email, name: conn.name };
  for (const f of CONNECTION_FIELDS) {
    if (conn[f] !== undefined && conn[f] !== null) out[f] = conn[f];
  }
  if (conn.providerSpecificData && Object.keys(conn.providerSpecificData).length > 0) {
    out.providerSpecificData = conn.providerSpecificData;
  }
  return out;
}

export async function GET() {
  try {
    const allConns = await getProviderConnections();
    const grouped = {};
    for (const c of allConns) {
      if (!grouped[c.provider]) {
        const p = AI_PROVIDERS[c.provider];
        grouped[c.provider] = {
          name: p?.name || c.provider,
          alias: p?.alias || c.provider,
          authType: c.authType,
          connectionCount: 0,
        };
      }
      grouped[c.provider].connectionCount++;
    }
    return NextResponse.json({ providers: grouped });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    if (action === "export") {
      const { providers } = body;
      if (!providers || !Array.isArray(providers) || providers.length === 0) {
        return NextResponse.json({ error: "Missing providers array" }, { status: 400 });
      }
      const allConns = await getProviderConnections();
      const output = { version: 1, exportedAt: new Date().toISOString(), providers: {} };
      for (const pid of providers) {
        const conns = allConns.filter(c => c.provider === pid);
        if (conns.length === 0) continue;
        const p = AI_PROVIDERS[pid];
        output.providers[pid] = {
          name: p?.name || pid, alias: p?.alias || pid,
          authType: conns[0].authType,
          connections: conns.map(sanitizeForExport),
        };
      }
      return NextResponse.json(output);
    }

    if (action === "import") {
      const { data } = body;
      if (!data || !data.providers) {
        return NextResponse.json({ error: "Invalid backup data" }, { status: 400 });
      }
      let imported = 0;
      let skipped = 0;
      for (const [pid, pdata] of Object.entries(data.providers)) {
        if (!pdata.connections || !Array.isArray(pdata.connections)) continue;
        for (const conn of pdata.connections) {
          const payload = { provider: pid, authType: conn.authType || pdata.authType || "oauth" };
          if (conn.email) payload.email = conn.email;
          if (conn.name) payload.name = conn.name;
          for (const f of CONNECTION_FIELDS) {
            if (conn[f] !== undefined) payload[f] = conn[f];
          }
          if (conn.providerSpecificData) payload.providerSpecificData = conn.providerSpecificData;
          try {
            await createProviderConnection(payload);
            imported++;
          } catch {
            skipped++;
          }
        }
      }
      return NextResponse.json({ success: true, imported, skipped });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
