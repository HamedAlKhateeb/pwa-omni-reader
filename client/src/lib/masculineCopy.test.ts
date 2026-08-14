import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "client");
const userFacingFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry);
  if (statSync(path).isDirectory()) return userFacingFiles(path);
  return /\.(tsx|ts|css|html)$/.test(entry) && !entry.endsWith(".test.ts") ? [path] : [];
});

const feminineAddress = /أنتِ|إليكِ|عليكِ|بكِ|لكِ|منكِ|عندكِ|تريدين|تستطيعين|تقومين|تعملين|تضيفين|تحفظين|تخزنين|تفتحين|تبحثين|تكتبين|تقرئين|تستوردين|تبدئين|تختارين|تستخدمين|تتابعين|تحددين|تضعين|تنهين|تستكملين|حددي|أضيفي|افتحي|اكتبي|ابحثي|ابدئي|استوردي|رتّبي|ضعي|استكملي|أنهيتِه|لتحتفظي|توقفتِ/g;

describe("لغة مخاطبة مسار", () => {
  it("لا تحتوي ملفات واجهة المستخدم على صيغ المخاطبة المؤنثة المحظورة", () => {
    const matches = userFacingFiles(sourceRoot).flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return Array.from(content.matchAll(feminineAddress), (match) => `${path.replace(sourceRoot, "client")}: ${match[0]}`);
    });
    expect(matches).toEqual([]);
  });
});
