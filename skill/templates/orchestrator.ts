import fs from "node:fs/promises";
import path from "node:path";

interface AtomicWriteOptions {
  filePath: string;
  value: unknown;
}

export async function writeAtomicJson(options: AtomicWriteOptions): Promise<void> {
  const dir = path.dirname(options.filePath);
  const base = path.basename(options.filePath);
  const tmpPath = path.join(dir, `.${base}.tmp`);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(options.value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, options.filePath);
}

export function stableFailureSignature(failureClass: string, primarySignal: string): string {
  const cleaned = primarySignal
    .toLowerCase()
    .replace(/\b\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/g, "")
    .replace(/\/[^\s]+/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .replace(/\s+/g, "_");

  return `${failureClass.toLowerCase()}:${cleaned || "unknown"}`;
}

export function shouldEscalateRepeatedSignature(
  repeatCount: number,
  signatureRepeatLimit: number,
): boolean {
  return repeatCount >= signatureRepeatLimit;
}
