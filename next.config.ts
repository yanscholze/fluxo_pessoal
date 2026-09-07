import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * O cache de navegação do cliente não guarda página nenhuma.
     *
     * Todas as páginas do painel são `force-dynamic`, mas isso vale para o
     * servidor: o roteador do cliente ainda guardava o resultado e o servia de
     * volta ao navegar. O sintoma era exato e confuso — lançar 9 horas dentro
     * do projeto, voltar para a lista, e ver "0,0 de 15,0 h" ali, enquanto a
     * tela do projeto mostrava as 9 horas certas. Dois números para o mesmo
     * dado, e o errado era o mais visível.
     *
     * `router.refresh()` depois de cada gravação resolvia a página onde a
     * gravação aconteceu, e só ela. Zerar aqui resolve todas.
     *
     * O preço é uma ida ao servidor por navegação. Num painel financeiro em que
     * cada tela é uma pergunta sobre dinheiro que acabou de mudar, é o preço
     * certo: número velho custa mais caro que meio segundo.
     */
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
