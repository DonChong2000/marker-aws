import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const API = process.env.API_URL!;
const POLL_MS = 3000;
const MAX_WAIT_MS = 14 * 60 * 1000;

function createServer() {
  const server = new McpServer({ name: "2md", version: "1.0.0" });

  server.tool(
    "convert_to_markdown",
    "Convert a publicly accessible document URL (PDF, DOCX, PPTX) to Markdown.",
    { url: z.string().url(), filename: z.string().optional() },
    async ({ url, filename }) => {
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
          const markdown = await fetch(downloadUrl).then((r) => r.text());
          return { content: [{ type: "text", text: markdown }] };
        }

        if (status === "failed") throw new Error("Conversion failed");
      }

      throw new Error("Timed out waiting for conversion");
    }
  );

  return server;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer();
  await server.connect(transport);
  const response = await transport.handleRequest(req as never, new NextResponse() as never, body);
  return response ?? new NextResponse(null, { status: 202 });
}

export async function GET(req: NextRequest) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer();
  await server.connect(transport);
  return transport.handleRequest(req as never, new NextResponse() as never, null);
}
