/**
 * Importar extrato.
 *
 * O celular é onde o arquivo chega: o aplicativo do banco exporta o OFX e
 * oferece compartilhar. Até aqui o caminho era mandar para si mesmo e abrir o
 * computador — o arquivo estava na mão e o Fluxo não sabia recebê-lo.
 *
 * **O que esta tela faz e o que não faz** é a decisão de projeto que importa.
 * Ela recebe o arquivo, cria o lote e mostra o que ele encontrou; a conferência
 * linha a linha fica no site. Não é falta: conferir cento e poucos lançamentos
 * é trabalho de tabela larga, e uma tabela larga num telefone vira rolagem
 * horizontal e erro de toque. O celular faz a parte que só ele pode fazer —
 * pegar o arquivo — e entrega a decisão onde ela se toma bem.
 *
 * Por isso o lote em conferência mostra os números e dois caminhos: aplicar,
 * quando eles claramente batem, ou descartar. Quem precisa olhar linha a linha
 * é avisado de onde fazê-lo.
 */

import { useState } from "react";
import { Alert, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { call } from "../net/client.ts";
import { fetchImportacoes, type LoteDeImportacao } from "../net/views.ts";
import { useLedger } from "../state/ledger.tsx";
import { useRemoto } from "../state/remote.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { relativeDate } from "../ui/format.ts";
import { Body, Button, Card, Empty, Label, Notice, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { space, usePalette } from "../ui/theme.ts";

const SITUACAO: Record<string, { rotulo: string; tom: "caution" | "positive" | "muted" }> = {
  review: { rotulo: "Em conferência", tom: "caution" },
  committed: { rotulo: "Aplicado", tom: "positive" },
  discarded: { rotulo: "Descartado", tom: "muted" },
};

/**
 * Teto do arquivo, em caracteres.
 *
 * O conteúdo sobe dentro de um JSON, e a rota recusa acima disso. Barrar aqui
 * dá uma mensagem que o usuário entende; deixar passar dá um 400 genérico
 * depois de uma espera.
 */
const MAX_CARACTERES = 2_000_000;

export function ImportarScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { synchronize } = useLedger();
  const remoto = useRemoto(fetchImportacoes);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function escolherArquivo() {
    setErro(null);
    setAviso(null);

    const escolha = await DocumentPicker.getDocumentAsync({
      // O Android costuma entregar OFX como `application/octet-stream`, e
      // filtrar por tipo esconderia justamente o arquivo que se quer abrir.
      type: "*/*",
      copyToCacheDirectory: true,
    });

    if (escolha.canceled || !escolha.assets[0]) return;
    const arquivo = escolha.assets[0];

    setEnviando(true);
    try {
      const conteudo = await FileSystem.readAsStringAsync(arquivo.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (conteudo.length > MAX_CARACTERES) {
        setErro(
          `O arquivo tem ${Math.round(conteudo.length / 1000)} mil caracteres e o limite é ${
            MAX_CARACTERES / 1000
          } mil. Importe um período menor pelo site.`,
        );
        return;
      }

      await call("/api/v1/imports", {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "POST",
        body: { filename: arquivo.name, content: conteudo },
      });

      setAviso(`"${arquivo.name}" entrou em conferência.`);
      remoto.recarregar();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível ler o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  async function agir(lote: LoteDeImportacao, acao: "aplicar" | "descartar") {
    setEnviando(true);
    setErro(null);
    try {
      await call(`/api/v1/imports/${lote.id}`, {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: acao === "aplicar" ? "POST" : "DELETE",
      });
      if (acao === "aplicar") await synchronize();
      remoto.recarregar();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível concluir.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaRemota
      titulo="Importar"
      descricao="Extrato do banco, direto do celular."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(lotes) => (
        <>
          <Card>
            <Label style={{ marginBottom: space.xs }}>Novo arquivo</Label>
            <Small style={{ marginBottom: space.md }}>
              OFX ou CSV. No aplicativo do banco, exporte o extrato e compartilhe com o Fluxo — ou
              escolha aqui um arquivo já salvo.
            </Small>
            <Button
              label={enviando ? "Lendo…" : "Escolher arquivo"}
              onPress={() => void escolherArquivo()}
              disabled={enviando}
              busy={enviando}
            />
            {aviso ? (
              <View style={{ marginTop: space.md }}>
                <Notice tone="positive">{aviso}</Notice>
              </View>
            ) : null}
            {erro ? (
              <View style={{ marginTop: space.md }}>
                <Notice tone="negative">{erro}</Notice>
              </View>
            ) : null}
          </Card>

          {lotes.length === 0 ? (
            <Card>
              <Empty
                title="Nenhuma importação"
                hint="O que você enviar aparece aqui com o que foi encontrado, antes de virar lançamento."
              />
            </Card>
          ) : (
            lotes.map((lote) => {
              const situacao = SITUACAO[lote.status] ?? SITUACAO.discarded;
              const emConferencia = lote.status === "review";

              return (
                <Card key={lote.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body numberOfLines={1}>{lote.filename}</Body>
                      <Small>
                        {lote.targetName} · {relativeDate(lote.createdAt.slice(0, 10) as never)}
                      </Small>
                    </View>
                    <Small tone={situacao.tom}>{situacao.rotulo}</Small>
                  </View>

                  <View style={{ marginTop: space.md }}>
                    <Row>
                      <Body muted>Encontrados</Body>
                      <Body strong>{lote.counts.found}</Body>
                    </Row>
                    <Row>
                      <Body muted>Novos</Body>
                      <Body strong>{lote.counts.fresh}</Body>
                    </Row>
                    <Row style={lote.counts.withoutCategory > 0 ? undefined : { borderBottomWidth: 0 }}>
                      <Body muted>Já existiam</Body>
                      <Body strong>{lote.counts.duplicates}</Body>
                    </Row>
                    {lote.counts.withoutCategory > 0 ? (
                      <Row style={{ borderBottomWidth: 0 }}>
                        <Body muted>Sem categoria</Body>
                        <Body strong style={{ color: palette.caution }}>
                          {lote.counts.withoutCategory}
                        </Body>
                      </Row>
                    ) : null}
                  </View>

                  {emConferencia ? (
                    <>
                      {/*
                        O aviso vem antes dos botões, não depois: aplicar é o
                        gesto irreversível desta tela, e a ressalva precisa ser
                        lida antes do dedo chegar nele.
                      */}
                      {lote.counts.withoutCategory > 0 || lote.counts.possibleTransfers > 0 ? (
                        <View style={{ marginTop: space.md }}>
                          <Notice tone="caution">
                            {lote.counts.possibleTransfers > 0
                              ? `${lote.counts.possibleTransfers} podem ser transferências entre contas suas. `
                              : ""}
                            Conferir linha a linha é no site — aqui a tabela não caberia sem rolagem
                            lateral.
                          </Notice>
                        </View>
                      ) : null}

                      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
                        <Button
                          label={`Aplicar ${lote.counts.fresh}`}
                          onPress={() =>
                            Alert.alert(
                              "Aplicar a importação?",
                              `${lote.counts.fresh} lançamento${lote.counts.fresh === 1 ? "" : "s"} entra${
                                lote.counts.fresh === 1 ? "" : "m"
                              } no extrato. Dá para apagar depois, um a um.`,
                              [
                                { text: "Cancelar", style: "cancel" },
                                { text: "Aplicar", onPress: () => void agir(lote, "aplicar") },
                              ],
                            )
                          }
                          disabled={enviando || lote.counts.fresh === 0}
                          style={{ flex: 1 }}
                        />
                        <Button
                          label="Descartar"
                          variant="ghost"
                          onPress={() =>
                            Alert.alert("Descartar o lote?", "Nada dele entra no extrato.", [
                              { text: "Cancelar", style: "cancel" },
                              {
                                text: "Descartar",
                                style: "destructive",
                                onPress: () => void agir(lote, "descartar"),
                              },
                            ])
                          }
                          disabled={enviando}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </>
                  ) : null}
                </Card>
              );
            })
          )}
        </>
      )}
    </TelaRemota>
  );
}
