# 🎮 DuoPlay Retro

<h1 align="center">DuoPlay</h1>

<h3 align="center">Uma experiência de jogos retrô, comunidade e conexão.</h3>

<p align="center">
  <a href="https://duoplayretro.netlify.app/">
    <img src="https://img.shields.io/badge/Acessar_Projeto-2ECC71?style=for-the-badge&logo=googlechrome&logoColor=white">
  </a>
  <a href="https://github.com/s1zaDv/DuoPlay-Retro">
    <img src="https://img.shields.io/badge/GitHub-3498DB?style=for-the-badge&logo=github&logoColor=white">
  </a>
</p>

<p align="center">
  <i>Conectando pessoas através da nostalgia dos jogos.</i>
</p>

---

### 📌 Sobre o projeto

O **DuoPlay** é um projeto independente voltado à arquitetura de emulação e **recompilação** em WebAssembly, criado para levar jogos de console a celulares, TV Boxes de hardware modesto e ambientes web sem exigir um PC ligado nem recorrer a atalhos que comprometam o quadro.

A proposta reúne um runtime próprio, organização de biblioteca com sistema manual estilo **Memory Card**, suporte expandido a controles e layout editável, além da integração com o ecossistema web do projeto, a comunidade e o fluxo de testes de builds.

Este projeto faz parte do meu **portfólio** e representa uma frente prática de **engenharia de software**, **análise de arquitetura de hardware**, **depuração iterativa e integração de sistemas**.

### 🛠️ Tecnologias e ferramentas

- **Runtime e emulação:** WebAssembly (Wasm), tradução e recompilação para PowerPC/Wii, com suporte a MEM1/MEM2, GX/TEV/XFB, FS/ISFS/IPC e validação em Chromium Headless.
- **Mobile e TV Box:** Empacotamento para Android, núcleos nativos ARM32 e otimizações voltadas a dispositivos com 2 GB de RAM.
- **Web, backend e infraestrutura:** HTML5, CSS3, JavaScript, Node.js, Supabase, Netlify e Cloudflare.
- **Versionamento e desenvolvimento:** Git, GitHub e ciclos iterativos de execução, testes, verificação, correção e telemetria.

### ⚙️ Estrutura do projeto

```text
DuoPlay-Retro/
│
├── public/              # Interface e arquivos do site
│
├── netlify/
│   └── functions/       # Funções de backend
│
├── supabase/
│   └── schema.sql       # Estrutura do banco de dados
│
├── docs/                # Documentação e integração
│
├── .env.example         # Exemplo de variáveis de ambiente
├── netlify.toml         # Configurações do Netlify
└── package.json         # Configurações do projeto
```

### 🌐 Acesse o projeto

<p align="center">
  <a href="https://duoplayretro.netlify.app/">
    <img src="https://img.shields.io/badge/DUOPLAY_RETRO-2ECC71?style=for-the-badge&logo=googlechrome&logoColor=white">
  </a>
</p>

**Status:** Em desenvolvimento.

**Finalidade:** Projeto independente, afim de devolver a potência bruta do console ao bolso e à sala via WebAssembly em hardware modesto, sem depender de PCs ligados nem de atalhos que traem o quadro.

---

<p align="center">
  <i>Ora et labora.</i>
  <br>
  <sub>Transformando ideias em projetos, um código de cada vez.</sub>
</p>
