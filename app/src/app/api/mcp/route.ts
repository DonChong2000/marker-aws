import { NextRequest, NextResponse } from "next/server";

const API = process.env.API_URL!;
const POLL_MS = 3000;
const MAX_WAIT_MS = 14 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
};

async function convertToMarkdown(url: string, filename?: string): Promise<string> {
  const name = filename ?? url.split("/").pop() ?? "document.pdf";

  const { jobId, uploadUrl } = await fetch(`${API}/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: name }),
  }).then((r) => r.json());

  const fileRes = await fetch(url);
  const fileBuffer = await fileRes.arrayBuffer();
  await fetch(uploadUrl, { method: "PUT", body: fileBuffer });

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const { status } = await fetch(`${API}/status/${jobId}`).then((r) => r.json());
    if (status === "done") {
      const { downloadUrl } = await fetch(`${API}/result/${jobId}`).then((r) => r.json());
      return fetch(downloadUrl).then((r) => r.text());
    }
    if (status === "failed") throw new Error("Conversion failed");
  }
  throw new Error("Timed out waiting for conversion");
}

const TOOLS = [
  {
    name: "convert_to_markdown",
    description: "Convert a publicly accessible document URL (PDF, DOCX, PPTX) to Markdown.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "Publicly accessible URL of the document to convert" },
        filename: { type: "string", description: "Optional filename hint (e.g. report.pdf)" },
      },
      required: ["url"],
    },
  },
];

function ok(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  return NextResponse.json(
    { name: "2md", version: "1.0.0", description: "Convert documents to Markdown" },
    { headers: CORS }
  );
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: { method: string; params?: any; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { method, params, id } = body;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "2md", version: "1.0.0" },
      });

    case "notifications/initialized":
      return new NextResponse(null, { status: 204, headers: CORS });

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      if (params?.name !== "convert_to_markdown") {
        return rpcError(id, -32602, "Unknown tool");
      }
      const { url, filename } = params.arguments ?? {};
      if (!url) return rpcError(id, -32602, "Missing required argument: url");
      try {
        const markdown = await convertToMarkdown(url as string, filename as string | undefined);
        return ok(id, { content: [{ type: "text", text: markdown }] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return ok(id, { content: [{ type: "text", text: `Error: ${msg}` }], isError: true });
      }
    }

    default:
      return rpcError(id, -32601, "Method not found");
  }
}
