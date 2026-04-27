import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "2md — Document to Markdown",
  description: "Convert PDF, DOCX, PPTX to Markdown",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
