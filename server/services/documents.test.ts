/**
 * Proposta e contrato, contra o banco.
 *
 * O que precisa ficar preso aqui é que o arquivo volta **byte a byte**: um
 * contrato que baixa corrompido é pior do que contrato nenhum, porque só se
 * descobre no dia em que ele precisa ser lido. E que o arquivo de um usuário
 * não é alcançável por outro — é um documento assinado, não um dado público.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

/** Um PDF mínimo, com bytes que não sobrevivem a uma conversão para texto. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x00, 0xff, 0xfe, 0x0a]);

function dataUrl(bytes: Uint8Array, tipo = "application/pdf"): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return `data:${tipo};base64,${btoa(binario)}`;
}

async function projeto(userId: string): Promise<string> {
  const { createProject } = await import("./work.ts");
  return createProject(userId, { name: "Site institucional", contract: cents(600_000) }, AGORA);
}

describe("documentos do projeto", () => {
  beforeEach(() => {
    zerar();
  });

  it("o arquivo volta idêntico ao que entrou", async () => {
    const { attachDocument, readDocument } = await import("./documents.ts");
    const alvo = await ambiente();
    const projectId = await projeto(alvo.userId);

    const id = await attachDocument(
      alvo.userId,
      {
        projectId,
        kind: "contract",
        name: "Contrato.pdf",
        contentType: "application/pdf",
        dataUrl: dataUrl(PDF),
      },
      AGORA,
    );

    const guardado = await readDocument(alvo.userId, id);

    assert.ok(guardado);
    assert.equal(guardado.name, "Contrato.pdf");
    assert.equal(guardado.contentType, "application/pdf");
    assert.deepEqual([...guardado.content], [...PDF], "byte a byte");
  });

  it("a listagem traz os metadados e nunca o conteúdo", async () => {
    const { attachDocument, listDocuments } = await import("./documents.ts");
    const alvo = await ambiente();
    const projectId = await projeto(alvo.userId);

    await attachDocument(
      alvo.userId,
      {
        projectId,
        kind: "proposal",
        name: "Proposta v2.pdf",
        contentType: "application/pdf",
        dataUrl: dataUrl(PDF),
        notes: "Enviada em 01/09",
      },
      AGORA,
    );

    const [linha] = await listDocuments(alvo.userId, projectId);

    assert.equal(linha.kind, "proposal");
    assert.equal(linha.sizeBytes, PDF.length);
    assert.equal(linha.notes, "Enviada em 01/09");
    assert.equal(Object.hasOwn(linha, "content"), false, "o conteúdo não pode vir na listagem");
  });

  it("recusa tipo fora da lista", async () => {
    const { attachDocument } = await import("./documents.ts");
    const alvo = await ambiente();
    const projectId = await projeto(alvo.userId);

    await assert.rejects(
      () =>
        attachDocument(
          alvo.userId,
          {
            projectId,
            kind: "other",
            name: "instalador.exe",
            contentType: "application/x-msdownload",
            dataUrl: dataUrl(PDF, "application/x-msdownload"),
          },
          AGORA,
        ),
      /não aceito/i,
    );
  });

  it("recusa quando o tipo declarado difere do conteúdo enviado", async () => {
    const { attachDocument } = await import("./documents.ts");
    const alvo = await ambiente();
    const projectId = await projeto(alvo.userId);

    await assert.rejects(
      () =>
        attachDocument(
          alvo.userId,
          {
            projectId,
            kind: "contract",
            name: "Contrato.pdf",
            contentType: "application/pdf",
            // O data URL diz outra coisa: algo montou o pedido à mão.
            dataUrl: dataUrl(PDF, "text/plain"),
          },
          AGORA,
        ),
      /não confere/i,
    );
  });

  it("recusa arquivo acima do teto", async () => {
    const { attachDocument, MAX_BYTES } = await import("./documents.ts");
    const alvo = await ambiente();
    const projectId = await projeto(alvo.userId);

    await assert.rejects(
      () =>
        attachDocument(
          alvo.userId,
          {
            projectId,
            kind: "contract",
            name: "Gigante.pdf",
            contentType: "application/pdf",
            dataUrl: dataUrl(new Uint8Array(MAX_BYTES + 1)),
          },
          AGORA,
        ),
      /grande demais/i,
    );
  });

  it("o documento de um usuário não é alcançável por outro", async () => {
    const { attachDocument, readDocument, removeDocument, listDocuments } = await import("./documents.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente();
    const projectId = await projeto(alvo.userId);

    const id = await attachDocument(
      alvo.userId,
      {
        projectId,
        kind: "contract",
        name: "Contrato.pdf",
        contentType: "application/pdf",
        dataUrl: dataUrl(PDF),
      },
      AGORA,
    );

    const { user: outro } = await signUp({
      email: "outro@fluxo.app",
      password: "senha-de-teste-123",
      displayName: "Outra Pessoa",
    });

    assert.equal(await readDocument(outro.id, id), null);
    assert.equal(await removeDocument(outro.id, id), false);
    assert.deepEqual(await listDocuments(outro.id, projectId), []);

    // E continua lá para o dono.
    assert.ok(await readDocument(alvo.userId, id));
  });

  it("apagar leva o conteúdo junto", async () => {
    const { attachDocument, readDocument, removeDocument } = await import("./documents.ts");
    const alvo = await ambiente();
    const projectId = await projeto(alvo.userId);

    const id = await attachDocument(
      alvo.userId,
      {
        projectId,
        kind: "contract",
        name: "Contrato.pdf",
        contentType: "application/pdf",
        dataUrl: dataUrl(PDF),
      },
      AGORA,
    );

    assert.equal(await removeDocument(alvo.userId, id), true);
    assert.equal(await readDocument(alvo.userId, id), null);
    assert.equal(await removeDocument(alvo.userId, id), false);
  });
});
