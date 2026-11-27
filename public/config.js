/* =====================================================================
   CONFIGURAÇÃO ÚNICA DO SITE DUOPLAY
   Para mudar preços, links, textos e dados, edite SÓ este arquivo.
   [ENTRE_COLCHETES] = informação que ainda falta: preencha antes de divulgar.
   null = ainda não disponível (o site mostra "em breve" ou "em preparação").
   ===================================================================== */
var SITE = {
  org: {
    name: "responsáveis pelo projeto DuoPlay",
    responsible: "s1za",
    foro: "Comarca de Aracaju/SE"
  }, // aparece nos documentos legais
  legalUpdated: "24 de novembro de 2026",
  DISCORD_INVITE_URL: null,              // cole o convite quando o servidor abrir; null = "Em breve"
  formAction: "/",                       // Netlify Forms: mantenha "/"; null desliga o envio

  /* ---- Planos: o site calcula equivalente mensal e economia a partir de price e months ---- */
  featuredPlan: "12m",
  benefits: [
    "Acesso ao DuoPlay durante o período contratado",
    "Atualizações disponibilizadas durante a vigência",
    "Suporte por meio da comunidade oficial",
    "Acesso aos recursos disponibilizados ao assinante, conforme as condições do serviço"
  ],
  plans: [                               // checkout: URL do gateway; null = botão "Em breve"
    { id: "1m",  name: "Mensal",     months: 1,  price: 19.99,  checkout: null },
    { id: "3m",  name: "Trimestral", months: 3,  price: 49.99,  checkout: null },
    { id: "6m",  name: "Semestral",  months: 6,  price: 89.99,  checkout: null },
    { id: "12m", name: "Anual",      months: 12, price: 149.99, checkout: null }
  ],
  billing: [                             // [rótulo, texto, link opcional]
    ["Forma de pagamento", "Pix, cartão de crédito, cartão de débito e boleto, via Mercado Pago", null],
    ["Renovação automática", "Não há: os planos são pré-pagos, por período determinado", null],
    ["Cancelamento", "Política de Cancelamento", "legal.html#cancelamento"],
    ["Reembolso", "Política de Reembolso", "legal.html#reembolso"],
    ["Acesso após cancelamento", "O aplicativo já instalado continua funcionando offline, sem novas atualizações", null]
  ],

  /* ---- Comunidade e contato ---- */
  categories: [
    { id: "duvida",   label: "Dúvidas",       hint: "Instalação, configuração, compatibilidade, planos e uso geral.", ph: "Escreva sua dúvida" },
    { id: "bug",      label: "Reportar bugs", hint: "Falhas, travamentos ou comportamentos inesperados. Preencha os dados do aparelho.", ph: "Descreva o problema" },
    { id: "denuncia", label: "Denúncias",     hint: "Canal privado: a denúncia não é publicada. Abusos, violações, distribuição indevida, fraudes.", ph: "Conte o que aconteceu" },
    { id: "sugestao", label: "Sugestões",     hint: "Ideias e melhorias do ponto de vista de quem usa. Não há promessa de implementação.", ph: "Qual é a sua ideia?" }
  ],
  channels: [                            // url: "mailto:..." ou link; null = "canal em preparação"
    { label: "Formulário de contato", url: "#contato", text: "Enviar mensagem nesta página" },   // quando houver e-mail, adicione: { label: "E-mail", url: "mailto:...", text: "..." }
    { label: "Discord", url: null, text: null }
  ],
  contactSubjects: ["Dúvidas gerais", "Suporte técnico", "Assinaturas e pagamentos", "Cancelamento", "Privacidade", "Direitos Autorais", "Moderação ou Apelação", "Denúncias", "Outros assuntos"],

  /* ---- Compatibilidade (nada de resultados inventados: preencha só o que foi testado) ---- */
  compat: {
    levels: ["Excelente", "Bom", "Parcial", "Não testado"],
    min: "[DEFINIR_REQUISITOS_MINIMOS]",
    rec: "[DEFINIR_REQUISITOS_RECOMENDADOS]",
    systems: "Android com processador ARM de 32 bits (ARM32)",
    limits: [],
    devices: []                          // { model, cpu, android, level, notes }
  },

  /* ---- Atualizações (linguagem para o usuário, sem detalhes internos) ---- */
  changelog: [
    { name: "Versão 0.7.9 (ainda não lançada)", date: "Em desenvolvimento",
      improvements: ["O projeto está trabalhando na recompilação de jogos de Nintendo Wii."], fixes: [], compat: [], issues: [],
      note: "O DuoPlay não fornece nem distribui jogos, ROMs, ISOs, código-fonte ou qualquer arquivo protegido da Nintendo ou de terceiros, e o projeto não utiliza esses materiais em seu desenvolvimento. O DuoPlay é independente e não tem afiliação com a Nintendo." }
  ],

  /* ---- Status do serviço: atualizado manualmente ---- */
  status: {
    state: "operacional",                // operacional | instabilidade | indisponibilidade | manutencao
    updated: null,                       // ex.: "19/11/2026 10:00"
    message: "Sem avisos no momento.",
    incidents: []                        // { date, text }
  },

  /* ---- FAQ ---- */
  faqCategories: ["Instalação", "Configuração", "Compatibilidade", "Controles", "Assinaturas", "Atualizações", "Solução de problemas"],
  faq: [
    { cat: "Instalação", q: "Como participo da Beta?", a: "Crie sua conta no site e clique em Se cadastrar na Beta. São 1.000 vagas." },
    { cat: "Configuração", q: "Preciso de conta para participar da Beta?", a: "Sim. O cadastro na Beta só é feito com uma conta DuoPlay." },
    { cat: "Configuração", q: "Posso ativar a verificação em duas etapas?", a: "Sim. Em Minha conta, na aba Segurança, você ativa com um aplicativo autenticador." },
    { cat: "Configuração", q: "Existe limite diário de uso na Beta?", a: "Sim: 1 hora por dia, contada por 24 horas a partir da meia-noite (horário de Brasília). Na versão oficial, o limite diário será de 10 minutos." },
    { cat: "Compatibilidade", q: "Funciona em qualquer aparelho?", a: "A Beta é para Android com processador ARM de 32 bits. Veja a Central de Compatibilidade." },
    { cat: "Controles", q: "Posso usar o celular como controle?", a: "Sim. Use o DuoPlay Controle no celular e escolha Jogador 1 ou 2." },
    { cat: "Assinaturas", q: "Quais planos existem?", a: "Mensal, trimestral, semestral e anual. Valores e condições estão na seção Planos." },
    { cat: "Atualizações", q: "Onde vejo as novidades?", a: "Na seção Atualizações desta página." },
    { cat: "Solução de problemas", q: "Encontrei um bug. Como aviso?", a: "Use a Central da Comunidade, categoria Reportar bugs, informando a versão do app, o modelo do aparelho e a versão do Android." }
  ],

  /* ---- Beta, conta e projeto ---- */
  beta: { slots: 1000, dailyMinutes: 60, officialDailyMinutes: 10 },   // as regras valem no banco (tabela beta_config)
  turnstileSiteKey: "0x4AAAAAAGTc5wj6-aUXXLmM",                // chave PÚBLICA do Cloudflare Turnstile (antirrobô); null = sem widget
  analytics: { gaId: null },             // ex.: "G-XXXXXXXXXX"; só carrega se a pessoa aceitar o aviso
  pix: "link.mercadopago.com.br/duoplay",                             // chave Pix para doações; null = botão "em breve"
  team: { name: "s1za", photo: null, bio: "Projeto independente, feito por uma pessoa e mantido com a ajuda da comunidade." },
  cases: [],                             // { title, text, author }: só relatos reais

  /* ---- Preparado para o futuro (ainda não ativo) ---- */
  protocolPrefix: "DP",                  // protocolos como DP-2026-00421, gerados pelo backend quando existir
  analytics: null,                       // ferramenta de métricas respeitando a LGPD, quando houver
  subscriberArea: null                   // URL da futura Área do Assinante (login, plano, vencimento, histórico)
};
