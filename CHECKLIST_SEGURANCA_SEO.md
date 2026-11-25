# Checklist: segurança (20) e site/SEO (20)
Legenda: **Feito** = implementado neste projeto · **Já tinha** = existia e foi mantido · **Você** = depende de uma ação sua · **N/A** = não se aplica.

## Segurança
| # | Item | Estado | Onde / o que falta |
|---|---|---|---|
| 1 | Esconder API keys | Feito | Nenhuma chave no front. Tudo em variáveis do Netlify (`.env.example`). A chave `anon` nem chega ao navegador: o site só fala com `/api/*`. **Você:** cadastrar as variáveis no Netlify. |
| 2 | Limpar secrets do git | Feito (preventivo) | `.gitignore`, `.env.example`, workflow `gitleaks` no histórico inteiro. **Você:** se algum segredo já foi commitado, troque a chave e limpe o histórico (`git filter-repo`). |
| 3 | Public key do banco | Feito | O front não tem chave do banco. Só URLs públicas de imagem (Storage). |
| 4 | Ativar RLS | Feito | `supabase/schema.sql`: RLS em todas as tabelas, sem políticas de escrita para clientes. **Você:** rodar o SQL. |
| 5 | Criptografia de dados | Feito | Telefone com AES-256-GCM (`APP_ENCRYPTION_KEY`), senhas com hash (Supabase Auth), HTTPS, Supabase criptografa em repouso. |
| 6 | Auth server side | Feito | Cada chamada valida a sessão no servidor; 2FA exige sessão `aal2`. |
| 7 | Restringir acessos | Feito | RLS, EXECUTE das funções revogado de anon/authenticated, `service_role` só no servidor, buckets só leitura pública. |
| 8 | Bloquear mass assignment | Feito | `PATCH /me` aceita só `display_name`, `bio`, `show_activity`, `phone`. Testado. |
| 9 | Proteger cookies | Feito | `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, checagem de `Origin` contra CSRF. |
| 10 | Hash nas senhas | Feito | Supabase Auth (bcrypt). O site nunca vê nem guarda a senha. |
| 11 | Rate limit | Feito | `rl_hit` no banco: login, cadastro, 2FA, recuperação, upload, amizades, app. Em escala muito alta, migrar para Redis/Upstash. |
| 12 | Bot protection | Feito | Cloudflare Turnstile em cadastro, login e recuperação. **Você:** criar o site no Turnstile (chave pública em `config.js`, secreta no Netlify). Em produção, sem chave, a API bloqueia. |
| 13 | Queries parametrizadas | Feito | Só PostgREST/RPC com parâmetros; valores validados por regex antes de entrar em filtros. Sem SQL montado com texto. |
| 14 | Validação dos inputs | Feito | Front + servidor (listas brancas) + `CHECK` no banco. |
| 15 | Vazar conteúdo | Feito | Erros genéricos sem detalhes internos, `Cache-Control: no-store`, respostas iguais para e-mail existente ou não, `noindex` na conta, logs sem dados pessoais. |
| 16 | Restringir uploads | Feito | PNG/JPG/WebP, checagem do cabeçalho do arquivo, 1 MB (foto) e 2 MB (banner), nome aleatório, limite de 10 por hora. |
| 17 | Trim das respostas | Feito | Serializadores explícitos: só os campos necessários (ver testes). |
| 18 | Security headers | Feito | `public/_headers`: HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP. Limite: a CSP ainda usa `'unsafe-inline'` porque as páginas têm script inline. |
| 19 | Forçar HTTPS | Feito | Netlify + HSTS + redirect + cookies `Secure` + `upgrade-insecure-requests`. |
| 20 | Scan de dependência | Feito | Workflow `npm audit` + Dependabot + gitleaks. O backend não usa pacotes npm. **Sugestão:** fixar `integrity` (SRI) nos scripts de GSAP e three.js. |

## Site, SEO e conversão
| # | Item | Estado | Onde / o que falta |
|---|---|---|---|
| 1 | Página 404 | Feito | `public/404.html` |
| 2 | CTAs claros | Feito | "Se cadastrar na Beta" no topo, na seção Beta, no menu "Entrar" e fixo no celular |
| 3 | Links personalizados | Feito | `/beta`, `/entrar`, `/cadastro`, `/termos`, `/privacidade`, `/cancelamento`, `/reembolso`, `/regras` (em `netlify.toml`) |
| 4 | Sessão de cases | Estrutura pronta | Seção **Cases** vazia de propósito (sem relatos inventados). Preencha `cases` no `config.js` com relatos reais. |
| 5 | Página de obrigado | Feito | `public/obrigado.html` (após formulários e após entrar na Beta) |
| 6 | Breadcrumbs | Feito | Documentos legais, conta, 404 e obrigado |
| 7 | FAQ com 5 perguntas | Já tinha | Agora tem 9 perguntas e marcação `FAQPage` para o Google |
| 8 | Promessa de resposta | Já tinha | "Responderemos assim que possível"; reembolso em até 3 dias úteis |
| 9 | CTA fixo no celular | Feito | Botão fixo embaixo em telas pequenas |
| 10 | robots.txt | Feito | Bloqueia `/conta.html`, `/api/`, `/obrigado.html` |
| 11 | Títulos únicos | Feito | Cada página tem o seu |
| 12 | Meta descriptions | Feito | Cada página tem a sua |
| 13 | Imagem de compartilhamento | Feito | `public/og.png` (1200×630) |
| 14 | Mapas e rotas | N/A | Projeto virtual, sem endereço |
| 15 | Avaliações reais | Você | Não criamos avaliações. Quando houver relatos reais, entram em `cases`. |
| 16 | Texto alternativo | Feito | Imagens com `alt` e elementos visuais com `aria-label` |
| 17 | Marcação de negócio local | N/A | Sem endereço físico. Usamos `WebSite`, `Organization` e `FAQPage`. |
| 18 | Política de privacidade | Já tinha | Atualizada com contas, 2FA, Supabase e exclusão da conta |
| 19 | Google Analytics | Pronto, desligado | Coloque o ID em `analytics.gaId`. Só carrega depois de a pessoa aceitar o aviso. **Antes de ligar**, atualize a seção Cookies da Política de Privacidade. |
| 20 | Foto da equipe e doação Pix | Estrutura pronta | Faltam: `team.photo` (foto real) e `pix` (chave Pix) no `config.js`. Sem eles, o botão fica "em breve". |
