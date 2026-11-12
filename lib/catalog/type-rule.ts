import type { TypeRuleInput } from "@/lib/domain/product-taxonomy";
import prisma from "@/lib/prisma";

/**
 * Regla de un tipo de producto para un departamento: lo que necesita
 * `validateClassification`. `null` si el tipo no existe. Sin departamento,
 * `appliesToDepartment` es true (no hay par que revisar). Solo servidor.
 */
export async function loadTypeRule(
  productTypeId: string,
  departmentId: string | null,
): Promise<{ name: string; slug: string; rule: TypeRuleInput } | null> {
  if (typeof productTypeId !== "string" || !productTypeId) return null;
  const type = await prisma.productType.findUnique({
    where: { id: productTypeId },
    select: {
      slug: true,
      name: true,
      isActive: true,
      departments: { where: { departmentId: departmentId ?? undefined }, select: { departmentId: true } },
    },
  });
  if (!type) return null;
  return {
    name: type.name,
    slug: type.slug,
    rule: {
      slug: type.slug,
      isActive: type.isActive,
      appliesToDepartment: departmentId ? type.departments.length > 0 : true,
    },
  };
}
