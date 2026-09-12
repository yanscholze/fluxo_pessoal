/**
 * Trocar a foto da face do cartão, pelo celular.
 *
 * O site já fazia isso; o celular é onde faz mais sentido — a câmera está na
 * mão, e o cartão também. Fotografar o cartão de dentro do aplicativo é o
 * caminho curto; abrir o computador para enviar uma foto tirada no celular é o
 * longo.
 *
 * O redimensionamento acontece **aqui**, antes de subir. Uma foto de câmera tem
 * vários megabytes e a face do cartão ocupa poucos centímetros na tela: mandar
 * o original gastaria o dado móvel de quem está na rua para desenhar algo que
 * ninguém enxerga em detalhe. O servidor recusa acima de 400 KB, e chegar lá
 * com o arquivo cru daria um erro que o usuário não teria como resolver.
 */

import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { call } from "../net/client.ts";
import { useConnectedSession } from "../state/session.tsx";
import { Button, Notice, Small } from "./primitives.tsx";
import { space } from "./theme.ts";

/** Largura máxima da face. Acima disso é detalhe que a tela não mostra. */
const LARGURA = 900;
/** Qualidade do JPEG. 0,82 é onde o artefato ainda não aparece num degradê. */
const QUALIDADE = 0.82;

export function CardPhoto({ cardId, aoTrocar }: { cardId: string; aoTrocar: () => void }) {
  const { credentials } = useConnectedSession();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /*
   * Se há foto, o próprio componente descobre.
   *
   * O razão local não guarda a imagem — ela vem por rota própria justamente
   * para não trafegar base64 de cinco cartões a cada abertura do aplicativo.
   * Perguntar aqui custa uma requisição quando o detalhe abre, e evita alargar
   * o modelo de sincronização por causa de um botão.
   *
   * `null` é "ainda não sei": enquanto não souber, o botão de remover não
   * aparece. Um botão que não faz nada é pior que nenhum botão.
   */
  const [temFoto, setTemFoto] = useState<boolean | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch(`${credentials.baseUrl}/api/v1/cards/${cardId}/image`, {
      headers: { authorization: `Bearer ${credentials.token}` },
    })
      .then((resposta) => {
        if (ativo) setTemFoto(resposta.ok);
      })
      .catch(() => {
        if (ativo) setTemFoto(false);
      });

    return () => {
      ativo = false;
    };
  }, [cardId, credentials]);

  async function escolher(daCamera: boolean) {
    setErro(null);

    /*
     * A permissão é pedida no momento do uso, não na abertura do aplicativo.
     * Um pedido de câmera sem contexto é negado — e negado, não volta a ser
     * oferecido pelo sistema.
     */
    const permissao = daCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissao.granted) {
      setErro(
        daCamera
          ? "Sem permissão de câmera. Libere nos ajustes do sistema."
          : "Sem permissão para acessar as fotos.",
      );
      return;
    }

    const opcoes: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      // O recorte na proporção do cartão evita subir uma foto com a mesa
      // inteira em volta — e é a mesma proporção que a face desenha.
      allowsEditing: true,
      aspect: [1586, 1000],
      quality: 1,
    };

    const resultado = daCamera
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes);

    if (resultado.canceled || !resultado.assets[0]) return;

    setEnviando(true);
    try {
      const reduzida = await ImageManipulator.manipulateAsync(
        resultado.assets[0].uri,
        [{ resize: { width: LARGURA } }],
        { compress: QUALIDADE, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!reduzida.base64) throw new Error("não foi possível ler a imagem");

      await call(`/api/v1/cards/${cardId}/image`, {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "PUT",
        body: { dataUrl: `data:image/jpeg;base64,${reduzida.base64}` },
      });

      setTemFoto(true);
      aoTrocar();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    setEnviando(true);
    setErro(null);
    try {
      await call(`/api/v1/cards/${cardId}/image`, {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "DELETE",
      });
      setTemFoto(false);
      aoTrocar();
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Não foi possível remover.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button
          label="Fotografar"
          variant="secondary"
          onPress={() => void escolher(true)}
          disabled={enviando}
          style={{ flex: 1 }}
        />
        <Button
          label="Da galeria"
          variant="secondary"
          onPress={() => void escolher(false)}
          disabled={enviando}
          style={{ flex: 1 }}
        />
      </View>

      {temFoto === true ? (
        <Button
          label="Remover foto"
          variant="ghost"
          onPress={() =>
            Alert.alert("Remover a foto?", "A face volta a usar só a cor do cartão.", [
              { text: "Cancelar", style: "cancel" },
              { text: "Remover", style: "destructive", onPress: () => void remover() },
            ])
          }
          disabled={enviando}
        />
      ) : null}

      {erro ? <Notice tone="negative">{erro}</Notice> : null}
      {enviando ? <Small tone="muted">Enviando…</Small> : null}
    </View>
  );
}
