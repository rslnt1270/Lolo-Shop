// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import path from "node:path";

const eslint = new ESLint({ cwd: process.cwd() });

async function restricted(code: string, file: string) {
  const [res] = await eslint.lintText(code + "\nexport {};\n", {
    filePath: path.join(process.cwd(), file),
  });
  return res.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("fronteras de lo público (ESLint)", () => {
  it.each([
    ['import { PrismaClient } from "@prisma/client";'],
    ['import prisma from "@/lib/prisma";'],
    ['import type { Product } from "@/lib/domain/types";'],
    ['import { x } from "@/lib/generated/prisma/client";'],
    ['import { PrismaInventoryDataSource } from "@/lib/data/prisma";'],
  ])("rechaza %s en components/virtual-store", async (code) => {
    const msgs = await restricted(code, "components/virtual-store/X.tsx");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].severity).toBe(2);
    expect(msgs[0].message).toContain("Lo público usa solo PublicProduct");
  });

  it.each(["lib/virtual-store/X.ts", "app/catalogo/X.tsx"])(
    "también protege %s",
    async (file) => {
      const msgs = await restricted('import prisma from "@/lib/prisma";', file);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].severity).toBe(2);
    },
  );

  it("permite @prisma/client fuera de la zona pública", async () => {
    expect(await restricted('import { PrismaClient } from "@prisma/client";', "lib/data/X.ts")).toHaveLength(0);
  });

  it("permite PublicProduct en la zona pública", async () => {
    const code = 'import type { PublicProduct } from "@/lib/data/public-projection";';
    expect(await restricted(code, "components/virtual-store/X.tsx")).toHaveLength(0);
  });
});
