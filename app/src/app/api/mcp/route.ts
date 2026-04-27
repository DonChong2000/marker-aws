import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { NextRequest } from "next/server";

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
          return { content: [{ type: "text" as const, text: markdown }] };
        }
        if (status === "failed") throw new Error("Conversion failed");
      }
      throw new Error("Timed out waiting for conversion");
    }
  );

  return server;
}

async function handleRequest(req: NextRequest) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createServer();
  await server.connect(transport);

  // Adapt NextRequest → Node-style request object the SDK expects
  const body = req.method === "POST" ? await req.text() : undefined;
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  return new Promise<Response>((resolve) => {
    const chunks: Buffer[] = [];
    let statusCode = 200;
    const resHeaders: Record<string, string> = {};

    const mockRes = {
      setHeader: (k: string, v: string) => { resHeaders[k] = v; },
      writeHead: (code: number, hdrs?: Record<string, string>) => {
        statusCode = code;
        if (hdrs) Object.assign(resHeaders, hdrs);
      },
      write: (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end: (chunk?: Buffer | string) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        resolve(new Response(body.length ? body : null, { status: statusCode, headers: resHeaders }));
      },
      on: () => {},
      once: () => {},
      emit: () => {},
    };

    const mockReq = {
      method: req.method,
      url: req.url,
      headers,
      body: body ? Buffer.from(body) : null,
      on: (event: string, cb: (data?: unknown) => void) => {
        if (event === "data" && body) cb(Buffer.from(body));
        if (event === "end") cb();
      },
    };

    transport.handleRequest(mockReq as never, mockRes as never, body ? JSON.parse(body) : undefined);
  });
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}
