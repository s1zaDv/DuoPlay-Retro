# DuoPlay: site, contas e Beta

```
public/                 site estático (Netlify publica só esta pasta)
netlify/functions/      API (api.js), sem dependências
supabase/schema.sql     banco: tabelas, RLS, funções, buckets
docs/                   integração com o app (Codex) e checklists
```

## Publicar (ordem)
1. **Supabase:** crie o projeto (região São Paulo, se disponível). SQL Editor: cole e rode `supabase/schema.sql`.
2. **Supabase > Authentication:** *Confirm email* ligado; *Site URL* `https://duoplayretro.netlify.app`; *Redirect URLs* inclua `https://duoplayretro.netlify.app/conta.html`; tamanho mínimo de senha 10; MFA (TOTP) ligado. **E-mails:** configure um SMTP próprio (por exemplo Resend, Brevo ou outro). Pelo que sei, o envio padrão do Supabase só serve para testes e não entrega para qualquer pessoa. Confirme na documentação dele.
3. **Cloudflare Turnstile:** crie um site, coloque a chave pública em `public/config.js` (`turnstileSiteKey`) e guarde a secreta.
4. **Netlify:** suba esta pasta num repositório do GitHub e conecte ao Netlify (as funções só funcionam assim ou pela CLI, não por arrastar arquivos). Em *Environment variables* cadastre o que está em `.env.example` (`APP_ENCRYPTION_KEY`: `openssl rand -base64 32`).
5. **Teste:** crie uma conta, confirme o e-mail, entre, ative o 2FA, adicione um amigo (use duas contas), cadastre-se na Beta e vincule o app (`docs/INTEGRACAO_APP_CODEX.md`).

## Para mudar o que aparece no site
Tudo em `public/config.js`: planos, preços, FAQ, status, atualizações, Pix, foto da equipe, Google Analytics, links. As regras da Beta (vagas e limite diário) ficam no banco, na tabela `beta_config`.

## Escala (muitos acessos)
Páginas estáticas ficam no CDN do Netlify. O banco só recebe login, perfil, amizades e uso. Antes do lançamento: use o plano Pro do Supabase, o *pooler* de conexões, teste de carga (k6 ou Artillery), alertas e backup testado. Se o rate limit pelo banco virar gargalo, troque `rl_hit` por Redis (Upstash).
