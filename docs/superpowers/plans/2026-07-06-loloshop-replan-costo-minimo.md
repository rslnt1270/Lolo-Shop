# LoloShop — Replanificación de Costo Mínimo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el bot de WhatsApp informativo (sin IA, sin N8N), el helper de identificación de producto por barcode genérico interno, y actualizar la documentación existente para reflejar el nuevo alcance de costo mínimo.

**Architecture:** El webhook de WhatsApp Cloud API llega directo a una API route de Next.js (`app/api/whatsapp/webhook/route.ts`) que valida la firma de Meta y delega en módulos puros y testeables bajo `lib/bot/` (contenido estático, parseo de payload, lógica de acciones, cliente HTTP saliente). El helper `effectiveBarcode` vive en `lib/domain/` junto al resto del dominio. Ningún módulo del bot llama a `InventoryDataSource`.

**Tech Stack:** Next.js 14 (App Router, Route Handlers con `Request`/`Response` estándar), TypeScript strict, Vitest, `node:crypto` (HMAC nativo, sin dependencias nuevas).

## Global Constraints

- Toda lógica de inventario pasa por `InventoryDataSource`; el bot **no** la usa (es puramente informativo).
- Sin IA (Claude/Haiku) y sin N8N en el bot — lógica de menú en código propio.
- TDD estricto: test que falla → implementación mínima → test pasa → commit.
- Commits en español, uno por tarea.
- Tests de rutas de Next.js (`app/api/**/__tests__`) requieren la directiva `// @vitest-environment node` como primera línea del archivo (el proyecto usa `jsdom` como entorno global en `vitest.config.ts`).
- Sin placeholders ("TBD", "TODO") en ningún doc o código tocado.

---

### Task 1: Identificación de producto — barcode genérico interno

**Files:**
- Create: `lib/domain/barcode.ts`
- Test: `lib/domain/__tests__/barcode.test.ts`

**Interfaces:**
- Consumes: `Variant` de `lib/domain/types.ts` (campos `barcode: string | null`, `sku: string`).
- Produces: `effectiveBarcode(variant: Variant): string` — usado por F2 (registro de entrada/salida) cuando se implemente `ShopifyDataSource`.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect } from "vitest";
import { effectiveBarcode } from "../barcode";
import type { Variant } from "../types";

function makeVariant(overrides: Partial<Variant>): Variant {
  return {
    id: "var-1",
    sku: "LS-HOO-NYY-M-NEG",
    title: "M / Negro",
    size: "M",
    color: "Negro",
    price: 450,
    barcode: null,
    inventory: [],
    ...overrides,
  };
}

describe("effectiveBarcode", () => {
  it("usa el barcode de fábrica cuando existe", () => {
    const variant = makeVariant({ barcode: "7501234567890" });
    expect(effectiveBarcode(variant)).toBe("7501234567890");
  });

  it("usa el SKU como barcode genérico interno cuando no hay barcode de fábrica", () => {
    const variant = makeVariant({ barcode: null });
    expect(effectiveBarcode(variant)).toBe("LS-HOO-NYY-M-NEG");
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `npx vitest run lib/domain/__tests__/barcode.test.ts`
Expected: FAIL — `Cannot find module '../barcode'`

- [ ] **Step 3: Implementación mínima**

```typescript
import type { Variant } from "./types";

/** El identificador escaneable de una variante: su barcode de fábrica si
 *  existe, o su SKU como barcode genérico interno cuando no lo tiene. */
export function effectiveBarcode(variant: Variant): string {
  return variant.barcode ?? variant.sku;
}
```

- [ ] **Step 4: Confirmar que pasa**

Run: `npx vitest run lib/domain/__tests__/barcode.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/barcode.ts lib/domain/__tests__/barcode.test.ts
git commit -m "feat: identificación de producto solo por barcode (genérico interno = SKU)"
```

---

### Task 2: Tipos y contenido estático del bot

**Files:**
- Create: `lib/bot/types.ts`
- Create: `lib/bot/content.ts`
- Test: `lib/bot/__tests__/content.test.ts`

**Interfaces:**
- Produces (`types.ts`): `WhatsAppOutboundMessage`, `IncomingMessage`, `BotAction` — usados por Tasks 3, 4, 6, 7.
- Produces (`content.ts`): `MENU_OPTIONS: readonly { id: string; title: string }[]`, `getMenuMessage(): WhatsAppOutboundMessage`, `getContentForOption(optionId: string): WhatsAppOutboundMessage | null` — usados por Task 4.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect } from "vitest";
import { MENU_OPTIONS, getMenuMessage, getContentForOption } from "../content";

describe("contenido del bot", () => {
  it("el menú incluye las 4 opciones esperadas", () => {
    expect(MENU_OPTIONS.map((o) => o.id)).toEqual(["horarios", "catalogo", "entrega", "faq"]);
  });

  it("getMenuMessage devuelve un mensaje interactivo tipo lista con las 4 filas", () => {
    const msg = getMenuMessage();
    expect(msg.type).toBe("interactive");
    expect(msg.interactive?.action.sections[0].rows).toHaveLength(4);
  });

  it("getContentForOption devuelve contenido para cada opción conocida", () => {
    for (const option of MENU_OPTIONS) {
      expect(getContentForOption(option.id)).not.toBeNull();
    }
  });

  it("getContentForOption devuelve null para una opción desconocida", () => {
    expect(getContentForOption("no-existe")).toBeNull();
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `npx vitest run lib/bot/__tests__/content.test.ts`
Expected: FAIL — `Cannot find module '../content'`

- [ ] **Step 3: Implementación mínima**

`lib/bot/types.ts`:

```typescript
export interface WhatsAppOutboundMessage {
  type: "text" | "interactive";
  text?: { body: string };
  interactive?: {
    type: "list";
    body: { text: string };
    action: {
      button: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string }>;
      }>;
    };
  };
}

export interface IncomingMessage {
  from: string;
  selection: string | null;
}

export type BotAction =
  | { type: "send"; to: string; message: WhatsAppOutboundMessage }
  | { type: "notifyStaff"; customerNumber: string };
```

`lib/bot/content.ts`:

```typescript
import type { WhatsAppOutboundMessage } from "./types";

export const MENU_OPTIONS = [
  { id: "horarios", title: "Horarios y ubicación" },
  { id: "catalogo", title: "Ver catálogo" },
  { id: "entrega", title: "Coordinar entrega" },
  { id: "faq", title: "Preguntas frecuentes" },
] as const;

export function getMenuMessage(): WhatsAppOutboundMessage {
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "¡Hola! Soy el asistente de LoloShop 👋 ¿En qué te ayudo?" },
      action: {
        button: "Ver opciones",
        sections: [
          {
            title: "Menú",
            rows: MENU_OPTIONS.map((o) => ({ id: o.id, title: o.title })),
          },
        ],
      },
    },
  };
}

const RESPONSES: Record<string, WhatsAppOutboundMessage> = {
  horarios: {
    type: "text",
    text: {
      body:
        "📍 Tienda 1: [dirección Tienda 1] — Lun a Sáb 10:00–20:00\n" +
        "📍 Tienda 2: [dirección Tienda 2] — Lun a Sáb 10:00–20:00\n" +
        "Ver en mapa: https://maps.app.goo.gl/TIENDA1 y https://maps.app.goo.gl/TIENDA2",
    },
  },
  catalogo: {
    type: "text",
    text: {
      body: "🛍️ Ve todo el catálogo actualizado aquí: https://lolo-bshop.myshopify.com",
    },
  },
  entrega: {
    type: "text",
    text: {
      body:
        "¡Con gusto! Puedes recoger en cualquiera de nuestras tiendas o coordinamos una entrega. " +
        "Un miembro de nuestro equipo te va a contactar en breve por este mismo chat.",
    },
  },
  faq: {
    type: "text",
    text: {
      body:
        "❓ Preguntas frecuentes:\n" +
        "• Envíos: a toda la República Mexicana desde la tienda online.\n" +
        "• Formas de pago en tienda: efectivo y tarjeta.\n" +
        "• Formas de pago en línea: tarjeta vía Mercado Pago en nuestro checkout.",
    },
  },
};

export function getContentForOption(optionId: string): WhatsAppOutboundMessage | null {
  return RESPONSES[optionId] ?? null;
}
```

- [ ] **Step 4: Confirmar que pasa**

Run: `npx vitest run lib/bot/__tests__/content.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/bot/types.ts lib/bot/content.ts lib/bot/__tests__/content.test.ts
git commit -m "feat: contenido estático y menú de botones del bot de WhatsApp"
```

---

### Task 3: Parseo de mensajes entrantes de WhatsApp

**Files:**
- Create: `lib/bot/parse-message.ts`
- Test: `lib/bot/__tests__/parse-message.test.ts`

**Interfaces:**
- Consumes: `IncomingMessage` de `lib/bot/types.ts` (Task 2).
- Produces: `parseIncomingMessage(payload: WhatsAppWebhookPayload): IncomingMessage | null` — usado por Task 7.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect } from "vitest";
import { parseIncomingMessage } from "../parse-message";

function payloadWithMessage(message: Record<string, unknown>) {
  return { entry: [{ changes: [{ value: { messages: [message] } }] }] };
}

describe("parseIncomingMessage", () => {
  it("extrae from y selection de una respuesta de lista", () => {
    const payload = payloadWithMessage({
      from: "5215555555555",
      type: "interactive",
      interactive: { list_reply: { id: "horarios" } },
    });
    expect(parseIncomingMessage(payload)).toEqual({ from: "5215555555555", selection: "horarios" });
  });

  it("extrae from y selection de una respuesta de botón", () => {
    const payload = payloadWithMessage({
      from: "5215555555555",
      type: "interactive",
      interactive: { button_reply: { id: "faq" } },
    });
    expect(parseIncomingMessage(payload)).toEqual({ from: "5215555555555", selection: "faq" });
  });

  it("selection es null para un mensaje de texto libre", () => {
    const payload = payloadWithMessage({ from: "5215555555555", type: "text" });
    expect(parseIncomingMessage(payload)).toEqual({ from: "5215555555555", selection: null });
  });

  it("devuelve null si no hay mensajes en el payload", () => {
    expect(parseIncomingMessage({ entry: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `npx vitest run lib/bot/__tests__/parse-message.test.ts`
Expected: FAIL — `Cannot find module '../parse-message'`

- [ ] **Step 3: Implementación mínima**

```typescript
import type { IncomingMessage } from "./types";

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          interactive?: {
            list_reply?: { id: string };
            button_reply?: { id: string };
          };
        }>;
      };
    }>;
  }>;
}

export function parseIncomingMessage(payload: WhatsAppWebhookPayload): IncomingMessage | null {
  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return null;

  const selection =
    message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? null;

  return { from: message.from, selection };
}
```

- [ ] **Step 4: Confirmar que pasa**

Run: `npx vitest run lib/bot/__tests__/parse-message.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/bot/parse-message.ts lib/bot/__tests__/parse-message.test.ts
git commit -m "feat: parseo del payload entrante de WhatsApp Cloud API"
```

---

### Task 4: Lógica de acciones del bot

**Files:**
- Create: `lib/bot/handle-message.ts`
- Test: `lib/bot/__tests__/handle-message.test.ts`

**Interfaces:**
- Consumes: `IncomingMessage`, `BotAction` de `lib/bot/types.ts` (Task 2); `getMenuMessage`, `getContentForOption` de `lib/bot/content.ts` (Task 2).
- Produces: `buildBotActions(message: IncomingMessage): BotAction[]` — usado por Task 7.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect } from "vitest";
import { buildBotActions } from "../handle-message";

describe("buildBotActions", () => {
  it("sin selección devuelve el menú principal", () => {
    const actions = buildBotActions({ from: "521555", selection: null });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "send", to: "521555" });
  });

  it("selección desconocida devuelve el menú principal", () => {
    const actions = buildBotActions({ from: "521555", selection: "no-existe" });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "send", to: "521555" });
  });

  it("selección 'horarios' responde con el contenido, sin avisar al staff", () => {
    const actions = buildBotActions({ from: "521555", selection: "horarios" });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("send");
  });

  it("selección 'entrega' responde Y avisa al staff", () => {
    const actions = buildBotActions({ from: "521555", selection: "entrega" });
    expect(actions).toHaveLength(2);
    expect(actions[1]).toEqual({ type: "notifyStaff", customerNumber: "521555" });
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `npx vitest run lib/bot/__tests__/handle-message.test.ts`
Expected: FAIL — `Cannot find module '../handle-message'`

- [ ] **Step 3: Implementación mínima**

```typescript
import type { BotAction, IncomingMessage } from "./types";
import { getContentForOption, getMenuMessage } from "./content";

export function buildBotActions(message: IncomingMessage): BotAction[] {
  const content = message.selection ? getContentForOption(message.selection) : null;

  if (!content) {
    return [{ type: "send", to: message.from, message: getMenuMessage() }];
  }

  const actions: BotAction[] = [{ type: "send", to: message.from, message: content }];
  if (message.selection === "entrega") {
    actions.push({ type: "notifyStaff", customerNumber: message.from });
  }
  return actions;
}
```

- [ ] **Step 4: Confirmar que pasa**

Run: `npx vitest run lib/bot/__tests__/handle-message.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/bot/handle-message.ts lib/bot/__tests__/handle-message.test.ts
git commit -m "feat: lógica de acciones del bot (menú, respuestas, aviso a staff)"
```

---

### Task 5: Verificación de firma del webhook (Meta)

**Files:**
- Create: `lib/bot/verify-signature.ts`
- Test: `lib/bot/__tests__/verify-signature.test.ts`

**Interfaces:**
- Consumes: nada de tasks previas (módulo independiente, solo `node:crypto`).
- Produces: `isValidSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean` — usado por Task 7.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { isValidSignature } from "../verify-signature";

describe("isValidSignature", () => {
  const secret = "test-secret";
  const body = '{"hello":"world"}';
  const validSignature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("acepta una firma válida", () => {
    expect(isValidSignature(body, validSignature, secret)).toBe(true);
  });

  it("rechaza una firma inválida", () => {
    expect(isValidSignature(body, "sha256=0000000000000000000000000000000000000000000000000000000000000000", secret)).toBe(false);
  });

  it("rechaza cuando no hay firma", () => {
    expect(isValidSignature(body, null, secret)).toBe(false);
  });

  it("rechaza si el cuerpo fue alterado", () => {
    expect(isValidSignature('{"hello":"world!"}', validSignature, secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `npx vitest run lib/bot/__tests__/verify-signature.test.ts`
Expected: FAIL — `Cannot find module '../verify-signature'`

- [ ] **Step 3: Implementación mínima**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
```

- [ ] **Step 4: Confirmar que pasa**

Run: `npx vitest run lib/bot/__tests__/verify-signature.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/bot/verify-signature.ts lib/bot/__tests__/verify-signature.test.ts
git commit -m "feat: verificación de firma HMAC del webhook de Meta"
```

---

### Task 6: Cliente de WhatsApp Cloud API

**Files:**
- Create: `lib/bot/whatsapp-client.ts`
- Test: `lib/bot/__tests__/whatsapp-client.test.ts`

**Interfaces:**
- Consumes: `WhatsAppOutboundMessage` de `lib/bot/types.ts` (Task 2). Env vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `STAFF_WHATSAPP_NUMBER`.
- Produces: `sendWhatsAppMessage(to: string, message: WhatsAppOutboundMessage): Promise<void>`, `notifyStaff(customerNumber: string): Promise<void>` — usados por Task 7.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsAppMessage, notifyStaff } from "../whatsapp-client";

describe("whatsapp-client", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
    process.env.WHATSAPP_ACCESS_TOKEN = "token-abc";
    process.env.STAFF_WHATSAPP_NUMBER = "5219999999999";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("sendWhatsAppMessage llama a la Graph API con el phone_number_id y token correctos", async () => {
    await sendWhatsAppMessage("5215555555555", { type: "text", text: { body: "hola" } });
    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v20.0/123456/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-abc" }),
      })
    );
  });

  it("sendWhatsAppMessage lanza error si la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(
      sendWhatsAppMessage("521555", { type: "text", text: { body: "x" } })
    ).rejects.toThrow();
  });

  it("notifyStaff envía un mensaje de texto al número de staff configurado", async () => {
    await notifyStaff("5215555555555");
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.to).toBe("5219999999999");
    expect(body.text.body).toContain("5215555555555");
  });

  it("notifyStaff no hace nada si no hay STAFF_WHATSAPP_NUMBER configurado", async () => {
    delete process.env.STAFF_WHATSAPP_NUMBER;
    await notifyStaff("5215555555555");
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `npx vitest run lib/bot/__tests__/whatsapp-client.test.ts`
Expected: FAIL — `Cannot find module '../whatsapp-client'`

- [ ] **Step 3: Implementación mínima**

```typescript
import type { WhatsAppOutboundMessage } from "./types";

export async function sendWhatsAppMessage(
  to: string,
  message: WhatsAppOutboundMessage
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...message }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp API error: ${res.status}`);
  }
}

export async function notifyStaff(customerNumber: string): Promise<void> {
  const staffNumber = process.env.STAFF_WHATSAPP_NUMBER;
  if (!staffNumber) return;

  await sendWhatsAppMessage(staffNumber, {
    type: "text",
    text: { body: `Un cliente quiere coordinar entrega. Contactar al número: ${customerNumber}` },
  });
}
```

- [ ] **Step 4: Confirmar que pasa**

Run: `npx vitest run lib/bot/__tests__/whatsapp-client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/bot/whatsapp-client.ts lib/bot/__tests__/whatsapp-client.test.ts
git commit -m "feat: cliente de WhatsApp Cloud API para enviar mensajes y avisar al staff"
```

---

### Task 7: Endpoint del webhook + exclusión en middleware

**Files:**
- Create: `app/api/whatsapp/webhook/route.ts`
- Test: `app/api/whatsapp/webhook/__tests__/route.test.ts`
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `isValidSignature` (Task 5), `parseIncomingMessage` (Task 3), `buildBotActions` (Task 4), `sendWhatsAppMessage`/`notifyStaff` (Task 6). Env var: `WHATSAPP_VERIFY_TOKEN`.
- Produces: `GET(req: Request): Promise<Response>`, `POST(req: Request): Promise<Response>` — endpoint final, sin consumidores dentro del repo.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/bot/verify-signature", () => ({ isValidSignature: vi.fn() }));
vi.mock("@/lib/bot/whatsapp-client", () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  notifyStaff: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "../route";
import { isValidSignature } from "@/lib/bot/verify-signature";
import { sendWhatsAppMessage, notifyStaff } from "@/lib/bot/whatsapp-client";

describe("GET /api/whatsapp/webhook (verificación de Meta)", () => {
  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
  });

  it("responde con el challenge cuando el modo y el token son correctos", async () => {
    const req = new Request(
      "https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("responde 403 cuando el token no coincide", async () => {
    const req = new Request(
      "https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=12345"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/whatsapp/webhook", () => {
  beforeEach(() => {
    vi.mocked(isValidSignature).mockReset();
    vi.mocked(sendWhatsAppMessage).mockClear();
    vi.mocked(notifyStaff).mockClear();
  });

  it("rechaza con 401 cuando la firma es inválida", async () => {
    vi.mocked(isValidSignature).mockReturnValue(false);
    const req = new Request("https://example.com/api/whatsapp/webhook", {
      method: "POST",
      body: "{}",
      headers: { "x-hub-signature-256": "sha256=mala" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("procesa el mensaje y envía la respuesta + aviso al staff cuando la firma es válida", async () => {
    vi.mocked(isValidSignature).mockReturnValue(true);
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "5215555555555",
                    type: "interactive",
                    interactive: { list_reply: { id: "entrega" } },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const req = new Request("https://example.com/api/whatsapp/webhook", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "x-hub-signature-256": "sha256=buena" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(notifyStaff).toHaveBeenCalledWith("5215555555555");
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `npx vitest run app/api/whatsapp/webhook/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Implementación mínima**

`app/api/whatsapp/webhook/route.ts`:

```typescript
import { isValidSignature } from "@/lib/bot/verify-signature";
import { parseIncomingMessage } from "@/lib/bot/parse-message";
import { buildBotActions } from "@/lib/bot/handle-message";
import { sendWhatsAppMessage, notifyStaff } from "@/lib/bot/whatsapp-client";

// Requiere en el entorno: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET,
// WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, STAFF_WHATSAPP_NUMBER.

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";

  if (!isValidSignature(rawBody, signature, appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const message = parseIncomingMessage(JSON.parse(rawBody));
  if (!message) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const actions = buildBotActions(message);
  for (const action of actions) {
    if (action.type === "send") {
      await sendWhatsAppMessage(action.to, action.message);
    } else {
      await notifyStaff(action.customerNumber);
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
```

Modificar `middleware.ts` para excluir `/api/whatsapp` del redirect de login de NextAuth (Meta llama a este endpoint sin sesión):

```typescript
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/((?!login|api/auth|api/whatsapp|manifest.json|icons|sw.js|workbox|_next).*)"],
};
```

- [ ] **Step 4: Confirmar que pasa**

Run: `npx vitest run app/api/whatsapp/webhook/__tests__/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Correr toda la suite y el build**

Run: `npm test && npm run build`
Expected: todos los tests en verde; build sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add app/api/whatsapp/webhook/route.ts app/api/whatsapp/webhook/__tests__/route.test.ts middleware.ts
git commit -m "feat: endpoint del webhook de WhatsApp (verificación + firma + menú) y exclusión en middleware"
```

---

### Task 8: Actualizar documentación existente

**Files:**
- Modify: `docs/superpowers/specs/2026-06-28-loloshop-whatsapp-bot-design.md`
- Modify: `docs/superpowers/specs/2026-06-26-loloshop-design.md`
- Modify: `docs/superpowers/plans/2026-06-28-loloshop-roadmap.md`

No hay tests para este task (solo documentación); la verificación es una lectura de fresh-eyes de que no quedan referencias a QR-con-branding, N8N o Mercado-Pago-vía-bot en las secciones tocadas.

- [ ] **Step 1: Marcar el spec del bot como deprecado**

En `docs/superpowers/specs/2026-06-28-loloshop-whatsapp-bot-design.md`, reemplazar la línea de estado:

Old:
```
**Estado:** Aprobado (diseño) — implementación pausada hasta resolver prerrequisitos
```

New:
```
**Estado:** DEPRECADO — reemplazado por `2026-07-06-loloshop-replan-costo-minimo-design.md` (bot informativo sin IA/N8N, sin cobro vía Mercado Pago). Se conserva como referencia histórica del diseño original.
```

- [ ] **Step 2: Actualizar identificación de producto en el spec de inventario**

En `docs/superpowers/specs/2026-06-26-loloshop-design.md`, reemplazar la sección completa:

Old:
```
## Sistema de Identificación de Productos (Híbrido)

- **Mercancía nueva sin barcode:** Se genera e imprime una etiqueta QR con branding de LoloShop
- **Mercancía con barcode de fábrica:** Se escanea el barcode existente y se registra en el variant de Shopify
- El QR contiene el **Variant ID de Shopify** para mapeo directo a producto + talla + color
- Las etiquetas QR se generan en formato imprimible (A4, múltiples por hoja) desde la misma app

**Formato de etiqueta QR:**
```
┌─────────────────┐
│  [LOGO LOLOSHOP]│
│  Hoodie NY      │
│  Talla: M       │
│  Color: Negro   │
│  $450.00        │
│     [QR CODE]   │
└─────────────────┘
```
```

New:
```
## Sistema de Identificación de Productos (Solo Barcode)

> Ver decisión completa en `2026-07-06-loloshop-replan-costo-minimo-design.md` §3.

- **Mercancía con barcode de fábrica:** se escanea el barcode existente y se registra en el variant de Shopify.
- **Mercancía sin barcode de fábrica:** se le asigna un **barcode genérico interno**, cuyo valor es el SKU ya generado (`effectiveBarcode()` en `lib/domain/barcode.ts`).
- Sin arte ni branding: la etiqueta impresa es texto + código de barras simple (Code128), no un QR diseñado.

**Formato de etiqueta:**
```
┌─────────────────┐
│  Hoodie NY      │
│  Talla: M       │
│  Color: Negro   │
│  $450.00        │
│  LS-HOO-NYY-M-NEG│
│  |||| ||| |||| ||│
└─────────────────┘
```
```

Reemplazar también, en la misma sección "Modelo de Datos (Shopify)":

Old:
```
└── METAFIELDS
    └── qr_label_url: enlace a etiqueta imprimible
```

New:
```
(sin metafield de QR: el barcode/SKU es la única fuente de verdad del identificador)
```

Reemplazar, en "Pantallas y Flujos → Escanear":

Old:
```
### Escanear
- Abre cámara → apunta a QR o barcode
```

New:
```
### Escanear
- Abre cámara → apunta al barcode (de fábrica o genérico interno)
```

Reemplazar, en "Registrar Entrada (nueva mercancía)":

Old:
```
1. Escanear QR/barcode O buscar manualmente
2. Si el producto **no existe** → formulario de creación:
   - Nombre, categoría, marca, precio
   - Variantes (talla + color)
   - Genera SKU automático
   - Genera e imprime etiqueta QR
```

New:
```
1. Escanear barcode O buscar manualmente
2. Si el producto **no existe** → formulario de creación:
   - Nombre, categoría, marca, precio
   - Variantes (talla + color)
   - Genera SKU automático
   - Si no hay barcode de fábrica, imprime etiqueta simple (Code128 + SKU)
```

Reemplazar, en "Registrar Salida (venta física)":

Old:
```
1. Escanear QR/barcode del producto
```

New:
```
1. Escanear barcode del producto
```

Reemplazar la sección "Generar / Imprimir QR":

Old:
```
### Generar / Imprimir QR
- Vista previa de etiquetas listas para imprimir
- Incluye: logo LoloShop, nombre, talla, color, precio, QR
- Formato A4 (múltiples etiquetas por hoja)
```

New:
```
### Generar / Imprimir Etiqueta
- Vista previa de etiquetas listas para imprimir
- Incluye: nombre, talla, color, precio, código de barras (Code128) + SKU en texto
- Sin logo ni layout de marca (etiqueta simple, no un QR diseñado)
- Formato A4 (múltiples etiquetas por hoja)
```

Reemplazar la fila de la tabla "Decisiones Técnicas Clave":

Old:
```
| QR vs Barcode | Híbrido | Flexibilidad: QR para nueva merch, barcode cuando ya existe |
```

New:
```
| Identificación de producto | Solo barcode (fábrica o genérico interno = SKU) | Menor costo/esfuerzo; ver `2026-07-06-loloshop-replan-costo-minimo-design.md` |
```

- [ ] **Step 3: Actualizar Fase 3, Fase 4, costos y prerrequisitos en el roadmap**

En `docs/superpowers/plans/2026-06-28-loloshop-roadmap.md`, reemplazar la sección de Fase 3:

Old:
```
### Fase 3 — Bot de WhatsApp + cobro (Mercado Pago)
Diseño aprobado: `2026-06-28-loloshop-whatsapp-bot-design.md`.
- Endpoints `/api/bot/*` en el PWA (TDD, fixtures primero), auth por `x-bot-key`.
- Workflow N8N: WhatsApp Trigger → AI Agent (Claude Haiku) → herramientas HTTP →
  WhatsApp send. Memoria por número.
- Cobro: link de pago **Mercado Pago** (nodo oficial) + webhook → aviso al staff.
- "Go live" con stock real cuando F2 conecte Shopify.
```

New:
```
### Fase 3 — Bot de WhatsApp informativo
Diseño aprobado: `2026-07-06-loloshop-replan-costo-minimo-design.md` (reemplaza el
diseño original con IA/N8N/Mercado-Pago-vía-bot).
- Endpoint `app/api/whatsapp/webhook/route.ts` en el PWA (TDD), sin N8N, sin IA.
- Menú de botones fijo: horarios/ubicación, catálogo (link a Shopify online),
  coordinar entrega (info + aviso al staff), FAQ.
- Sin cobro en el bot: los pagos en línea van por Shopify (ver Fase de Pagos).
```

Insertar después de la Fase 3 (antes de "### Fase 4 — Facebook Ads"), una nueva sección:

New (insertar):
```
### Pagos en línea — Shopify + Mercado Pago como pasarela
- Activar canal de ventas online de Shopify (checkout real).
- Instalar la app oficial de **Mercado Pago para Shopify** como pasarela
  (Shopify Payments no opera en México).
- Cero código propio de pagos: todo el flujo vive dentro de Shopify.

```

Reemplazar la sección de Fase 4:

Old:
```
### Fase 4 — Facebook Ads (adquisición)
Diseño en la sección "Módulo Facebook Ads" del spec del bot.
- Campañas **Click-to-WhatsApp** que aterrizan en el bot.
- **Conversions API**: reportar `Purchase` a Meta al confirmarse el pago.
- Catálogo Shopify → Meta (preferir canal nativo de Shopify).
- Panel mínimo: gasto, chats, ventas atribuidas.
- Depende de F3 (el anuncio necesita un bot funcional como destino).
```

New:
```
### Fase 4 — Facebook Ads (adquisición, alcance ajustado)
- Los anuncios dirigen a **redes sociales y al WhatsApp informativo** (no a
  un embudo de checkout online).
- Las ventas siguen siendo **100% físicas**, gestionadas por el encargado en
  tienda; no hay Conversions API de compra por ahora.
- Fase de baja prioridad/opcional; no bloquea nada de las anteriores.
```

Reemplazar la tabla de prerrequisitos:

Old:
```
| # | Prerrequisito | Habilita |
|---|---|---|
| 1 | Token de Shopify Admin API | F2 (stock real) |
| 2 | Inventario de productos cargado | F2 |
| 3 | Cuenta WhatsApp Business (Cloud API): token + WABA ID | F3 |
| 4 | Cuenta Mercado Pago + access token; community node en N8N | F3 |
| 5 | Instancia de N8N accesible por webhooks + API key de Claude | F3 |
| 6 | Logo/identidad final (carita guiño + teal) para iconos PWA y deck | F1/F3 |
| 7 | Meta Business Manager + cuenta publicitaria + Pixel/CAPI + catálogo | F4 |
```

New:
```
| # | Prerrequisito | Habilita |
|---|---|---|
| 1 | Token de Shopify Admin API | F2 (stock real) |
| 2 | Inventario de productos cargado | F2 |
| 3 | Cuenta WhatsApp Business (Cloud API): token + WABA ID + App Secret | F3 |
| 4 | Cuenta Mercado Pago habilitada como pasarela de Shopify (app oficial) | Pagos en línea |
| 5 | Activar canal de ventas online + checkout en Shopify | Pagos en línea |
| 6 | Logo/identidad final (carita guiño + teal) para iconos PWA y deck | F1 |
| 7 | Meta Business Manager + cuenta publicitaria (si se decide invertir en Ads) | F4 |
```

Reemplazar la sección de costos:

Old:
```
## Costos de operación (resumen)

**Fijo mensual ≈ $30–60 USD (~$600–1,100 MXN):**
- Vercel: $0 (Hobby) — ~$20 USD si escala.
- N8N: ~$6 USD (self-host VPS) o ~$24 USD (Cloud Starter, 2,500 ejecuciones).
- Claude Haiku 4.5: ~$5–15 USD a volumen bajo ($1/M entrada, $5/M salida; ~$0.02–0.05 por conversación).
- WhatsApp Business Cloud: ~$0 dentro de la ventana de servicio de 24h (bot reactivo).

**Variables (sobre ventas / a discreción):**
- Mercado Pago: 3.49% + $4.00 MXN + IVA por venta (link de pago, dinero al instante).
- Presupuesto de Facebook Ads: lo define el dueño (gasto a Meta).
```

New:
```
## Costos de operación (resumen)

**Fijo mensual ≈ $0–20 USD (~$0–400 MXN):**
- Vercel: $0 (Hobby) — ~$20 USD si escala.
- WhatsApp Business Cloud: $0 (bot reactivo e informativo, sin plantillas de marketing).
- N8N: $0 — eliminado (bot sin IA, orquestado directo en Next.js).
- Claude/IA: $0 — eliminado, el bot no usa LLM.

**Variables (sobre ventas / a discreción):**
- Mercado Pago como pasarela del checkout de Shopify: misma tarifa de mercado
  (~3.49% + $4.00 MXN + IVA por venta), ahora cobrada dentro de Shopify.
- Presupuesto de Facebook Ads: lo define el dueño (gasto a Meta).
```

- [ ] **Step 4: Verificación final de la suite completa**

Run: `npm test && npm run build`
Expected: todos los tests en verde; build sin errores (los cambios de este task son solo documentación, no deberían afectar el build, pero se corre como chequeo de salud del repo).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-28-loloshop-whatsapp-bot-design.md docs/superpowers/specs/2026-06-26-loloshop-design.md docs/superpowers/plans/2026-06-28-loloshop-roadmap.md
git commit -m "docs: actualizar bot spec, spec de inventario y roadmap al plan de costo mínimo"
```
