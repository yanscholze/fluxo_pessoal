/**
 * Service worker do Fluxo.
 *
 * Existe por dois motivos, nesta ordem: tornar o aplicativo instalável — o
 * Chrome exige um `fetch` registrado para oferecer a instalação — e dar uma
 * tela honesta quando não há rede, em vez do dinossauro do navegador.
 *
 * **O que ele não faz é a parte importante.** Nada de dado financeiro entra em
 * cache. Um extrato servido do cache é um extrato desatualizado apresentado
 * como se fosse atual, e num aplicativo cuja única promessa é "o saldo está
 * certo" isso é pior do que não abrir. Só o casco entra: ícones, fontes,
 * manifesto — coisas que não têm versão do usuário dentro.
 *
 * A estratégia é rede primeiro, sempre. O cache é o que sobra quando a rede
 * falha, e só para o que é estático.
 */

const VERSAO = "fluxo-v1";

/** O mínimo para a janela abrir dizendo alguma coisa. */
const CASCO = ["/offline.html", "/icons/icone-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(CASCO))
      // Falhar ao pré-carregar não pode impedir a instalação: sem rede no
      // primeiro acesso, o service worker ainda serve para as próximas vezes.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((chave) => chave !== VERSAO).map((chave) => caches.delete(chave))))
      .then(() => self.clients.claim()),
  );
});

/** Recursos que podem ficar em cache: não carregam dado de ninguém. */
function ehEstatico(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.svg" ||
    /\.(png|svg|woff2?|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;

  // Só GET. Um POST repetido do cache criaria lançamento em dobro.
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  // A API nunca é interceptada: dado financeiro vem do servidor ou não vem.
  if (url.pathname.startsWith("/api/")) return;

  if (ehEstatico(url)) {
    evento.respondWith(
      caches.match(requisicao).then(
        (guardado) =>
          guardado ??
          fetch(requisicao).then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone();
              caches.open(VERSAO).then((cache) => cache.put(requisicao, copia));
            }
            return resposta;
          }),
      ),
    );
    return;
  }

  // Navegação: rede primeiro, e a página de indisponível quando ela falha.
  if (requisicao.mode === "navigate") {
    evento.respondWith(
      fetch(requisicao).catch(() => caches.match("/offline.html").then((r) => r ?? Response.error())),
    );
  }
});
