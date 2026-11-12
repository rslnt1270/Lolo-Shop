import { STYLE_OPTIONS } from "./product-types-catalog";

export const AUDIENCES = ["dama", "caballero", "nino"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABELS: Readonly<Record<Audience, string>> = {
  dama: "Dama",
  caballero: "Caballero",
  nino: "Niño",
};
/** Solo este departamento lleva «para». */
export const AUDIENCE_DEPARTMENT_SLUG = "calzado";

export const MSG_PICK_TYPE = "Elige el tipo.";
export const MSG_TYPE_INACTIVE = "Ese tipo ya no está activo. Elige otro de la lista.";
export const MSG_TYPE_NOT_APPLICABLE = "Ese tipo no aplica al departamento elegido. Elige otro de la lista.";
export const MSG_AUDIENCE_REQUIRED = "En Calzado elige para quién es: dama, caballero o niño.";
export const MSG_AUDIENCE_ONLY_CALZADO = "«Para» solo se usa en Calzado.";
export const MSG_AUDIENCE_INVALID = "Elige para quién es: dama, caballero o niño.";
export const MSG_STYLE_NOT_APPLICABLE = "Ese estilo no aplica a ese tipo.";

export function isAudience(x: unknown): x is Audience {
  return typeof x === "string" && (AUDIENCES as readonly string[]).includes(x);
}

export type TypeRuleInput = { slug: string; isActive: boolean; appliesToDepartment: boolean };

const isBlank = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Valida tipo, estilo y «para» de un producto. Lanza Error con el mensaje para
 * el operador; un error por regla, en este orden: tipo, activo, aplica,
 * «para» (obligatorio en Calzado / sobra fuera / valor), estilo.
 */
export function validateClassification(input: {
  departmentSlug: string;
  type: TypeRuleInput | null;
  style?: unknown;
  audience?: unknown;
}): { style: string | null; audience: Audience | null } {
  const { type } = input;
  if (!type) throw new Error(MSG_PICK_TYPE);
  if (!type.isActive) throw new Error(MSG_TYPE_INACTIVE);
  if (!type.appliesToDepartment) throw new Error(MSG_TYPE_NOT_APPLICABLE);

  const isCalzado = input.departmentSlug === AUDIENCE_DEPARTMENT_SLUG;
  let audience: Audience | null = null;
  if (isCalzado) {
    if (isBlank(input.audience)) throw new Error(MSG_AUDIENCE_REQUIRED);
    if (!isAudience(input.audience)) throw new Error(MSG_AUDIENCE_INVALID);
    audience = input.audience;
  } else if (!isBlank(input.audience)) {
    throw new Error(MSG_AUDIENCE_ONLY_CALZADO);
  }

  let style: string | null = null;
  if (!isBlank(input.style)) {
    const options = STYLE_OPTIONS[type.slug] ?? [];
    if (typeof input.style !== "string" || !options.some((o) => o.slug === input.style)) {
      throw new Error(MSG_STYLE_NOT_APPLICABLE);
    }
    style = input.style;
  }
  return { style, audience };
}

export type ClassificationIssue =
  | "SIN_DEPARTAMENTO"
  | "SIN_TIPO"
  | "TIPO_INACTIVO"
  | "TIPO_NO_APLICA"
  | "FALTA_PARA"
  | "PARA_SOBRA"
  | "ESTILO_NO_APLICA";

/** Reglas vigentes: solo departamentos y tipos activos. */
export type ClassificationRules = {
  departments: { id: string; slug: string }[];
  types: { id: string; slug: string; departmentIds: string[] }[];
};

/** Problemas de clasificación de un producto, en orden fijo (base de «Por revisar»). */
export function classificationIssues(
  p: {
    departmentId: string | null;
    productTypeId: string | null;
    style: string | null;
    audience: string | null;
  },
  rules: ClassificationRules,
): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  const department = p.departmentId ? rules.departments.find((d) => d.id === p.departmentId) : undefined;
  if (!p.departmentId) issues.push("SIN_DEPARTAMENTO");
  const type = p.productTypeId ? rules.types.find((t) => t.id === p.productTypeId) : undefined;
  if (!p.productTypeId) issues.push("SIN_TIPO");
  else if (!type) issues.push("TIPO_INACTIVO");
  else if (p.departmentId && !type.departmentIds.includes(p.departmentId)) issues.push("TIPO_NO_APLICA");

  const isCalzado = department?.slug === AUDIENCE_DEPARTMENT_SLUG;
  if (isCalzado && !isAudience(p.audience)) issues.push("FALTA_PARA");
  if (!isCalzado && !isBlank(p.audience)) issues.push("PARA_SOBRA");

  if (!isBlank(p.style)) {
    const options = type ? STYLE_OPTIONS[type.slug] ?? [] : [];
    if (!options.some((o) => o.slug === p.style)) issues.push("ESTILO_NO_APLICA");
  }
  return issues;
}

/** Tipos activos que admite un departamento. */
export function typesForDepartment<T extends { departmentIds: string[] }>(
  types: readonly T[],
  departmentId: string,
): T[] {
  return types.filter((t) => t.departmentIds.includes(departmentId));
}
