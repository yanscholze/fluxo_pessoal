/**
 * As migrations são embutidas no bundle como texto.
 *
 * O Worker não tem sistema de arquivos: ler `.sql` em tempo de execução não é
 * possível. O `?raw` do Vite inlina o conteúdo no build, o que também garante
 * que o código deployado e as migrations que ele aplica sejam sempre a mesma
 * versão.
 */
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
