import fs from "fs";
import path from "path";

export function ensureJsonFile<T>(filePath: string, fallback: T): T {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

export function writeJsonFile<T>(filePath: string, data: T) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
