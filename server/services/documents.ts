/**
 * Os papéis do projeto: proposta e contrato.
 *
 * Guarda o arquivo, e não um link para ele. Link some: a proposta que mora no
 * Drive de alguém deixa de abrir quando a pasta é reorganizada, e é justamente
 * no dia da discussão sobre escopo que ela precisa abrir. O que se combinou
 * por escrito é a única defesa contra "mas isso estava incluído".
 *
 * O conteúdo vai para uma tabela à parte dos metadados. Listar os documentos de
 * um projeto — o que a tela do projeto faz sempre — não pode arrastar os
 * megabytes de todos eles junto; a listagem lê só nome, tipo e tamanho.
 *
 * O arquivo chega em base64 dentro de JSON, como já acontece com a foto do
 * cupom fiscal. É o mesmo caminho e a mesma limitação, e vale por não exigir
 * um binding de armazenamento de objetos que esta instalação não tem.
 */

import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { projectDocumentBlobs, projectDocuments } from "../db/schema/index.ts";
import { findProject } from "../repositories/work.ts";

/**
 * Teto por arquivo.
 *
 * Dois megabytes é o mesmo teto do importador de extrato, e é generoso para o
 * que se guarda aqui: proposta e contrato são documentos de texto, não
 * digitalizações em alta. O limite existe porque o conteúdo mora numa linha do
 * banco, e uma linha gigante torna lenta toda consulta que a atravessa.
 */
export const MAX_BYTES = 2_000_000;

/**
 * O que se aceita guardar.
 *
 * Lista fechada: aceitar qualquer tipo transformaria o campo num depósito de
 * arquivos arbitrários servidos de volta pelo domínio da aplicação, o que é
 * uma porta de XSS quando o navegador resolve interpretar o que baixou.
 */
const TIPOS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "text/plain": "txt",
  "text/markdown": "md",
};

export type DocumentKind = "proposal" | "contract" | "other";

export type DocumentInput = {
  readonly projectId: string;
  readonly kind: DocumentKind;
  readonly name: string;
  readonly contentType: string;
  /** `data:<tipo>;base64,<conteúdo>` — o mesmo formato que o cupom usa. */
  readonly dataUrl: string;
  readonly notes?: string | null;
};

export type DocumentView = {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly notes: string | null;
  readonly uploadedAt: string;
};

/** Extrai os bytes do `data:` URL, recusando o que não é do formato esperado. */
function bytesDe(dataUrl: string, contentType: string): Uint8Array {
  const marcador = ";base64,";
  const corte = dataUrl.indexOf(marcador);
  if (!dataUrl.startsWith("data:") || corte === -1) {
    throw validationError("Arquivo em formato inesperado", [
      { path: "dataUrl", message: "Envie o arquivo como data URL em base64" },
    ]);
  }

  const declarado = dataUrl.slice("data:".length, corte);
  // O tipo declarado no cabeçalho do data URL e o do campo têm de bater: se
  // divergirem, algo montou o pedido à mão e não dá para saber qual é o certo.
  if (declarado !== contentType) {
    throw validationError("O tipo do arquivo não confere", [
      { path: "contentType", message: "O tipo declarado difere do conteúdo enviado" },
    ]);
  }

  const base64 = dataUrl.slice(corte + marcador.length);
  let binario: string;
  try {
    binario = atob(base64);
  } catch {
    throw validationError("Não foi possível ler o arquivo", [
      { path: "dataUrl", message: "O conteúdo não é base64 válido" },
    ]);
  }

  const bytes = new Uint8Array(binario.length);
  for (let indice = 0; indice < binario.length; indice += 1) {
    bytes[indice] = binario.charCodeAt(indice);
  }
  return bytes;
}

export async function attachDocument(
  userId: string,
  input: DocumentInput,
  now: Date = new Date(),
): Promise<string> {
  const projeto = await findProject(userId, input.projectId);
  if (!projeto) throw notFound("Projeto", input.projectId);

  if (!TIPOS[input.contentType]) {
    throw validationError("Tipo de arquivo não aceito", [
      { path: "contentType", message: "Envie PDF, Word, imagem ou texto" },
    ]);
  }

  const nome = input.name.trim();
  if (!nome) {
    throw validationError("Informe o nome do arquivo", [
      { path: "name", message: "O nome é obrigatório" },
    ]);
  }

  const bytes = bytesDe(input.dataUrl, input.contentType);
  if (bytes.length === 0) {
    throw validationError("O arquivo está vazio", [
      { path: "dataUrl", message: "Escolha um arquivo com conteúdo" },
    ]);
  }
  if (bytes.length > MAX_BYTES) {
    throw conflict("Arquivo grande demais", {
      details: { maxBytes: MAX_BYTES, sizeBytes: bytes.length },
    });
  }

  const database = getDatabase();
  const id = newId(now.getTime());

  await database.insert(projectDocuments).values({
    id,
    userId,
    projectId: input.projectId,
    kind: input.kind,
    name: nome,
    contentType: input.contentType,
    sizeBytes: bytes.length,
    notes: input.notes ?? null,
    uploadedAt: now.toISOString(),
  });

  await database.insert(projectDocumentBlobs).values({ documentId: id, content: bytes });

  return id;
}

/** Os documentos de um projeto — só os metadados, nunca o conteúdo. */
export async function listDocuments(
  userId: string,
  projectId: string,
): Promise<DocumentView[]> {
  const linhas = await getDatabase()
    .select({
      id: projectDocuments.id,
      kind: projectDocuments.kind,
      name: projectDocuments.name,
      contentType: projectDocuments.contentType,
      sizeBytes: projectDocuments.sizeBytes,
      notes: projectDocuments.notes,
      uploadedAt: projectDocuments.uploadedAt,
    })
    .from(projectDocuments)
    .where(and(eq(projectDocuments.userId, userId), eq(projectDocuments.projectId, projectId)))
    .orderBy(desc(projectDocuments.uploadedAt));

  return linhas;
}

export type StoredDocument = {
  readonly name: string;
  readonly contentType: string;
  readonly content: Uint8Array;
};

/** O arquivo em si, para a rota de download. */
export async function readDocument(
  userId: string,
  documentId: string,
): Promise<StoredDocument | null> {
  const database = getDatabase();

  // Colunas explícitas: num `join`, `id` existe nas duas tabelas e a linha
  // achatada faz uma sobrescrever a outra sem erro nenhum.
  const [linha] = await database
    .select({
      name: projectDocuments.name,
      contentType: projectDocuments.contentType,
      content: projectDocumentBlobs.content,
    })
    .from(projectDocuments)
    .innerJoin(projectDocumentBlobs, eq(projectDocumentBlobs.documentId, projectDocuments.id))
    .where(and(eq(projectDocuments.userId, userId), eq(projectDocuments.id, documentId)))
    .limit(1);

  if (!linha) return null;

  return {
    name: linha.name,
    contentType: linha.contentType,
    // O driver devolve Buffer no Node e ArrayBuffer no Worker; normalizar aqui
    // evita que a rota precise saber em qual runtime está.
    content: linha.content instanceof Uint8Array ? linha.content : new Uint8Array(linha.content as ArrayBuffer),
  };
}

export async function removeDocument(userId: string, documentId: string): Promise<boolean> {
  const database = getDatabase();

  const [existente] = await database
    .select({ id: projectDocuments.id })
    .from(projectDocuments)
    .where(and(eq(projectDocuments.userId, userId), eq(projectDocuments.id, documentId)))
    .limit(1);
  if (!existente) return false;

  // O conteúdo cai junto pela chave estrangeira em cascata; apagá-lo à mão
  // antes deixaria órfão o dia em que a cascata falhasse.
  await database
    .delete(projectDocuments)
    .where(and(eq(projectDocuments.userId, userId), eq(projectDocuments.id, documentId)));
  return true;
}
