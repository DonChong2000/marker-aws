"use client";

import { useState, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL!;
const POLL_MS = 3000;

type Status = "idle" | "uploading" | "processing" | "done" | "failed";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleConvert() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError("");
    setMarkdown("");

    try {
      const { jobId, uploadUrl } = await fetch(`${API}/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      }).then((r) => r.json());

      await fetch(uploadUrl, { method: "PUT", body: file });

      setStatus("processing");

      while (true) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const { status: jobStatus } = await fetch(`${API}/status/${jobId}`).then((r) => r.json());

        if (jobStatus === "done") {
          const { downloadUrl } = await fetch(`${API}/result/${jobId}`).then((r) => r.json());
          const md = await fetch(downloadUrl).then((r) => r.text());
          setMarkdown(md);
          setStatus("done");
          break;
        }

        if (jobStatus === "failed") {
          throw new Error("Conversion failed on the server.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("failed");
    }
  }

  function handleDownload() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ maxWidth: 800, margin: "60px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1>2md</h1>
      <p>Convert PDF, DOCX, or PPTX to Markdown.</p>

      <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx" />
      <button onClick={handleConvert} disabled={status === "uploading" || status === "processing"}>
        {status === "uploading" ? "Uploading…" : status === "processing" ? "Converting…" : "Convert"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {status === "done" && (
        <>
          <button onClick={handleDownload}>Download .md</button>
          <textarea
            readOnly
            value={markdown}
            style={{ width: "100%", height: 400, marginTop: 16, fontFamily: "monospace" }}
          />
        </>
      )}
    </main>
  );
}
