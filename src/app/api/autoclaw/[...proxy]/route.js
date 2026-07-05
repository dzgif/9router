import { NextResponse } from "next/server";
import { start, stop, getStatus } from "@/lib/autoclaw/manager";

const AUTOCLAW_BASE = "http://127.0.0.1:31000";

export async function GET(req, { params }) {
  const { proxy } = await params;
  if (!proxy || proxy.length === 0) {
    return NextResponse.json({ error: "No path specified" }, { status: 400 });
  }

  const path = proxy.join("/");
  if (path === "status") {
    return NextResponse.json(getStatus());
  }

  try {
    const url = `${AUTOCLAW_BASE}/${path}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (e) {
    return NextResponse.json(
      { error: `AutoClaw proxy unreachable: ${e.message}` },
      { status: 502 }
    );
  }
}

export async function POST(req, { params }) {
  const { proxy } = await params;
  if (!proxy || proxy.length === 0) {
    return NextResponse.json({ error: "No path specified" }, { status: 400 });
  }

  const path = proxy.join("/");

  if (path === "start") {
    const result = await start();
    return NextResponse.json(result);
  }

  if (path === "stop") {
    const result = stop();
    return NextResponse.json(result);
  }

  try {
    const url = `${AUTOCLAW_BASE}/${path}`;
    const body = req.body ? await req.json() : undefined;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = resp.headers.get("content-type")?.includes("json")
      ? await resp.json()
      : await resp.text();
    return NextResponse.json(data, { status: resp.status });
  } catch (e) {
    return NextResponse.json(
      { error: `AutoClaw proxy unreachable: ${e.message}` },
      { status: 502 }
    );
  }
}

export async function DELETE(req, { params }) {
  const { proxy } = await params;
  if (!proxy || proxy.length === 0) {
    return NextResponse.json({ error: "No path specified" }, { status: 400 });
  }

  const path = proxy.join("/");

  try {
    const url = `${AUTOCLAW_BASE}/${path}`;
    const resp = await fetch(url, { method: "DELETE" });
    const data = resp.headers.get("content-type")?.includes("json")
      ? await resp.json()
      : await resp.text();
    return NextResponse.json(data, { status: resp.status });
  } catch (e) {
    return NextResponse.json(
      { error: `AutoClaw proxy unreachable: ${e.message}` },
      { status: 502 }
    );
  }
}
