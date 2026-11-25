# Integração do app Android (DuoPlay) com a conta do site

Instruções para o Codex ligar o app (TV box e DuoPlay Controle) ao site: **conta, atividade, amizades, Beta e limite diário**.
O app NUNCA fala com o banco. Ele só chama a API do site, com um token próprio.

- **Base URL:** `https://duoplayretro.netlify.app/api` (coloque em `BuildConfig`, só HTTPS).
- **Formato:** JSON (`Content-Type: application/json`). Erros: `{"error":"codigo"}` com status HTTP 4xx/5xx.
- **Código-fonte da API:** `netlify/functions/api.js` (função `appRoutes`). Banco: `supabase/schema.sql`.

## 1. Vincular o app à conta (fluxo de código de dispositivo)
Não peça e-mail nem senha no app (digitar na TV é ruim e inseguro). Use o código:

1. O app chama `POST /app/device/start` (sem corpo). Resposta:
   `{"device_code":"<segredo, só o app guarda>","user_code":"ABCD-1234","verification_url":"https://duoplayretro.netlify.app/conta.html#vincular","expires_in":600,"interval":5}`
2. O app mostra, grande na tela, o `user_code` e o endereço `duoplayretro.netlify.app/conta`. (Opcional: QR da `verification_url`.)
3. A pessoa entra na conta no site, aba **App**, digita o código e confirma.
4. Enquanto isso o app chama `POST /app/device/poll` com `{"device_code":"..."}` a cada `interval` segundos (máx. 10 min):
   - `{"status":"pending"}` → continue esperando.
   - `{"status":"expired"}` → volte ao passo 1.
   - `{"status":"ok","app_token":"dpapp_..."}` → **o token aparece uma única vez**. Guarde com segurança.
5. Todas as outras chamadas levam `Authorization: Bearer dpapp_...`.

**Guardar o token:** `EncryptedSharedPreferences` (Jetpack Security) ou Android Keystore. Nunca em log, nunca em arquivo aberto, nunca no backup (`android:allowBackup="false"` ou exclua o arquivo). Se qualquer chamada devolver **401**, apague o token e refaça o vínculo.

## 2. Endpoints do app (todos com Bearer, limite de 600 chamadas por 10 min por conta)
| Método e caminho | Corpo | Resposta |
|---|---|---|
| `GET /app/me` | – | `{"me":{"username","tag","display_name","avatar"}}` |
| `GET /app/friends` | – | `{"friends":[…],"incoming":[…],"outgoing":[…]}` (cada item: `id, username, tag, display_name, avatar`) |
| `GET /app/friends/activity` | – | `{"activity":[{"username","tag","display_name","avatar","game_title","platform","started_at"}]}` só amigos jogando agora |
| `POST /app/activity` | `{"game_title":"…","platform":"SNES"}` | `{"ok":true}` |
| `DELETE /app/activity` | – | `{"ok":true}` |
| `GET /app/beta` | – | `{"beta":{"taken","total","joined","limit_seconds","used_seconds","remaining_seconds"}}` |
| `POST /app/usage` | `{"seconds":60}` (inteiro de 1 a 300) | `{"used_seconds","remaining_seconds"}` ou `{"error":"not_in_beta"}` |

Sem token válido, `device/start` e `device/poll` são as únicas rotas abertas (têm limite por IP).

## 3. Atividade (o que o amigo está jogando)
- Ao abrir um jogo: `POST /app/activity` com o título (até 80 caracteres) e a plataforma (até 30).
- **Batimento a cada 60 s** enquanto joga. O servidor considera "jogando agora" só quem atualizou nos últimos 3 minutos.
- Ao sair do jogo, pausar ou fechar o app: `DELETE /app/activity`.
- A pessoa pode ocultar a atividade no site (`show_activity=false`). O **servidor** já respeita isso: o app não precisa filtrar.
- Nunca envie caminho de arquivo, nome do arquivo da ROM nem dados do aparelho. Só o título que o usuário vê.

## 4. Beta e limite diário (o servidor manda)
- Ao abrir o app e ao iniciar cada jogo: `GET /app/beta`.
  - `joined=false` → mostre "Cadastre-se na Beta em duoplayretro.netlify.app" e bloqueie o uso.
  - `remaining_seconds <= 0` → bloqueie com a mensagem do limite diário.
- Enquanto joga: a cada 30 a 60 s, `POST /app/usage` com os segundos realmente jogados desde a última chamada (nunca mais de 300). Use a resposta (`remaining_seconds`) para o contador na tela. Ao chegar a 0, encerre o jogo com aviso.
- **Regra de negócio** (vive no banco, tabela `beta_config`): Beta = 3.600 s por dia; versão oficial = 600 s por dia. O dia vai de 00:00 a 23:59 no horário de Brasília (America/Sao_Paulo). Para a versão oficial basta mudar `daily_limit_seconds` no banco, sem mexer no app.
- O app não decide limite sozinho. Contador local só serve para a tela. **Decisão em aberto (produto):** o que fazer offline. Sugestão: bloquear jogos novos até conseguir falar com o servidor, ou permitir uma tolerância curta e sincronizar depois.

## 5. Amigos
No app, só **ler**: lista de amigos, pedidos e atividade (atualizar no máximo a cada 30 s). Adicionar, aceitar e remover amigos é feito no site. Mostre avatar com cache de imagem (as URLs são públicas e vêm no campo `avatar`; pode ser `null`, use as iniciais).

## 6. Erros e boas práticas
- `401` → token inválido: apagar e refazer vínculo. `429` → espere (recuo exponencial: 5 s, 10 s, 20 s…). `400` → bug do app (campo inválido). `5xx` → tente de novo mais tarde.
- Timeout de 10 s por chamada. Não repita chamadas em laço apertado.
- Sem chaves do Supabase no app. Sem URLs do banco. Sem `service_role`. O app só conhece a Base URL e o `app_token`.
- Opcional: fixação de certificado (certificate pinning). Ofuscação (R8) ligada em release.
- Não registrar em log: token, `device_code`, e-mail, resposta completa.

## 7. Exemplo em Kotlin (OkHttp + org.json)
```kotlin
class DuoApi(private val http: OkHttpClient, private val base: String, private val store: TokenStore) {
    private val json = "application/json".toMediaType()

    suspend fun linkDevice(onCode: (userCode: String, url: String) -> Unit): Boolean {
        val s = post("/app/device/start", JSONObject(), auth = false)
        onCode(s.getString("user_code"), s.getString("verification_url"))
        val deadline = System.currentTimeMillis() + 600_000
        while (System.currentTimeMillis() < deadline) {
            delay(s.getLong("interval") * 1000)
            val p = post("/app/device/poll", JSONObject().put("device_code", s.getString("device_code")), auth = false)
            when (p.getString("status")) {
                "ok" -> { store.save(p.getString("app_token")); return true }
                "expired" -> return false
            }
        }
        return false
    }

    suspend fun heartbeat(title: String, platform: String) =
        post("/app/activity", JSONObject().put("game_title", title).put("platform", platform))

    suspend fun addUsage(seconds: Int): JSONObject =
        post("/app/usage", JSONObject().put("seconds", seconds.coerceIn(1, 300)))

    private suspend fun post(path: String, body: JSONObject, auth: Boolean = true): JSONObject = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(base + path).post(body.toString().toRequestBody(json)).apply {
            if (auth) header("Authorization", "Bearer " + (store.load() ?: throw IllegalStateException("sem token")))
        }.build()
        http.newCall(req).execute().use { r ->
            if (r.code == 401) { store.clear(); throw UnauthorizedException() }
            JSONObject(r.body?.string().orEmpty().ifEmpty { "{}" }).also { if (!r.isSuccessful) throw ApiException(r.code, it.optString("error")) }
        }
    }
}
```

## 8. Roteiro de testes (curl)
```bash
B=https://duoplayretro.netlify.app/api
curl -s -X POST $B/app/device/start                     # guarde device_code e user_code
# no site (logado): aba App, digite o user_code
curl -s -X POST $B/app/device/poll -H 'Content-Type: application/json' -d '{"device_code":"..."}'
T=dpapp_...                                             # token recebido
curl -s $B/app/me -H "Authorization: Bearer $T"
curl -s -X POST $B/app/activity -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"game_title":"Teste","platform":"SNES"}'
curl -s $B/app/beta -H "Authorization: Bearer $T"
curl -s -X POST $B/app/usage -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"seconds":60}'
```
Esperado: `me` devolve usuário e tag; `activity` aparece para um amigo em `/app/friends/activity`; `usage` desconta de `remaining_seconds`; token errado devolve 401.

## 9. Contrato estável
As rotas `/api/app/*` são o contrato com o app. Mudanças que quebrem versões antigas devem ir para `/api/app/v2/*`, mantendo as atuais enquanto houver app instalado. Para revogar um token, apague a linha em `app_tokens` no banco.
