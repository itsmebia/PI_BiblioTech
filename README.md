# BiblioTech — Sistema de Gestão de Bibliotecas Escolares (PoC)

Projeto Integrador · SENAC EAD · ADS · 2ª entrega (2026.2) — Prof. Anderson Clayton

## Prova de conceito (PoC)
**Jornada implementada:** *Marta Silva (bibliotecária) atende um aluno no balcão* — a jornada central do produto:
login → painel com usuários em atraso → busca do aluno (status ativo/suspenso) → registro de devolução → novo empréstimo → recibo com a data de devolução.

**Cadastro do acervo:** cadastrar, editar e excluir obras; adicionar/remover exemplares (cópias físicas); colocar exemplar em manutenção; busca por título, autor, ISBN ou gênero, filtro por gênero e por disponibilidade.

**Cadastro de leitores:** cadastrar, editar e excluir alunos e professores (aba Leitores), com busca por nome ou matrícula, status (ativo/suspenso) e quantidade de obras em posse.

**Regras de negócio validadas**
- Limite de obras por perfil (aluno 2 · professor 5) e prazo por perfil (7 e 15 dias).
- Exemplar indisponível não pode ser emprestado (regra na aplicação **e** no banco, por índice único).
- Suspensão automática ao devolver com atraso: 1 dia de suspensão por dia de atraso (ex.: 3 dias de atraso → suspenso até 3 dias depois da devolução, inclusive), sem multa financeira. A suspensão é aplicada no registro da devolução: enquanto o livro atrasado não volta, o painel o lista em atraso, mas o leitor ainda pode pegar outras obras dentro do limite do perfil.
- Obra ou exemplar com histórico de empréstimos não pode ser apagado (preserva o registro); para retirar de circulação, usa-se "Em Manutenção".
- Leitor com histórico de empréstimos não pode ser excluído; matrícula é única; aluno exige turma; ninguém vira administrador pela API; trocar de perfil não pode deixar o leitor acima do novo limite de obras.
- ISBN único, com formato validado (10 ou 13 dígitos; o dígito verificador não é conferido nesta PoC); exemplar emprestado não muda de status manualmente.
- Empréstimo/devolução são atômicos: o registro e o status do exemplar mudam juntos ou não mudam.

## Stack
| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript (módulos ES), responsivo, com a identidade visual do projeto (paleta #5D2410 · #EDE1D1 · #7F6044 · #412E27; fontes Lora e Poppins, carregadas do Google Fonts: precisam de internet, e sem ela o navegador usa fontes padrão) |
| Backend | Node.js 22.13 ou superior — API REST com `node:http` |
| Banco de dados | SQLite (`node:sqlite`, embutido no Node; módulo ainda marcado como experimental no Node 22, e por isso o `npm start` usa `--no-warnings`) |
| Testes | `node:test` — 42 testes de integração (negócio, acervo, leitores e segurança) |
| Dependências externas | **nenhuma biblioteca npm** (reduz a superfície de ataque e dispensa `npm install`) |

## Arquitetura
```
Navegador ──HTTP/JSON──► app.js ─► rotas.js ─► servicos/ (regras de negócio) ─► db/ (SQLite)
                           │
                           └─ seguranca/ (sessão, senha, limite de login, cabeçalhos, validação)
```
```
backend/
├── server.js            ponto de entrada
├── app.js               servidor HTTP: defesas comuns a toda requisição
├── rotas.js             tabela de rotas da API
├── config.js            configuração (variáveis de ambiente)
├── erros.js · log.js · datas.js
├── db/                  conexão, esquema (com restrições) e dados de demonstração
├── servicos/            circulacao (empréstimo/devolução) · acervo e leitores (cadastros) · consultas · autenticacao
├── seguranca/           senhas · sessoes · limitador · cabecalhos · validacao
├── http/                resposta (JSON, cookies, corpo) · estaticos
└── tests/               negocio · acervo · leitores · seguranca
frontend/
├── index.html · style.css
└── js/                  main · api · dom · avisos · telas/(painel, balcao, acervo, leitores)
```
Modelo de dados: `usuarios` · `obras` (1) ─ (N) `exemplares` · `emprestimos` (usuário × exemplar).

## Como executar
Requisito: **Node.js 22.13 ou superior** (a partir dessa versão o `node:sqlite` dispensa a flag `--experimental-sqlite`; em versões anteriores o `npm start` falha). Não é preciso instalar mais nada.
```bash
git clone https://github.com/itsmebia/PI_BiblioTech.git
cd PI_BiblioTech
npm start          # abre em http://localhost:3000
npm test           # 42 testes automatizados
```
Login de demonstração: usuário `marta` · senha `bibliotech123`.
Na primeira execução o banco é criado com dados de exemplo com **dados fictícios**: 21 obras (≈40 exemplares), 10 alunos e 3 professores (todos fictícios), empréstimos em dia, 3 em atraso (Lucas, Rafael e Camila), uma aluna suspensa (Mariana), histórico de devoluções e um exemplar em manutenção.
Para recomeçar a demonstração do zero, apague `backend/bibliotech.db` e reinicie.

### Variáveis de ambiente
| Variável | Para quê |
|---|---|
| `PORT` | Porta do servidor (padrão 3000) |
| `HOST` | Endereço de escuta (padrão `0.0.0.0`; atrás de um proxy reverso, use `127.0.0.1`) |
| `ADMIN_PASSWORD` | Senha da conta de administração na carga inicial. **Obrigatória** em produção |
| `NODE_ENV=production` | Desliga a senha de demonstração |
| `TRUST_PROXY=1` | Use só atrás de proxy reverso confiável: ativa o cookie `Secure` e o IP real do cliente |
| `DB_FILE` | Caminho do arquivo do banco |

## Segurança — OWASP Top 10 (2021)
| Risco | O que foi feito | Onde |
|---|---|---|
| **A01** Controle de acesso | Toda rota da API exige sessão de administradora (negação por padrão); proteção anti-CSRF em 3 camadas (cookie `SameSite=Strict`, checagem de `Sec-Fetch-Site`, exigência de JSON); arquivos estáticos protegidos contra *path traversal* | `app.js`, `http/estaticos.js` |
| **A02** Falhas criptográficas | Senhas com **scrypt + sal** e comparação em tempo constante; token de sessão de 256 bits guardado só como hash; cookie `HttpOnly` (e `Secure` quando a conexão é HTTPS); nenhum segredo no código; HSTS sob HTTPS | `seguranca/senhas.js`, `sessoes.js` |
| **A03** Injeção | 100% das consultas SQL parametrizadas; validação de tipo/tamanho de toda entrada; curingas do `LIKE` escapados; frontend sem `innerHTML` (anti-XSS) + CSP | `seguranca/validacao.js`, `db/`, `frontend/js/dom.js` |
| **A04** Design inseguro | Limite de tamanho do corpo, de resultados e de tentativas de login; regras de negócio e integridade garantidas também no banco (`CHECK`, `UNIQUE`, chave estrangeira); transações atômicas | `config.js`, `db/esquema.js` |
| **A05** Configuração insegura | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; API com `Cache-Control: no-store`; erros genéricos (sem *stack trace*); senha padrão proibida em produção; *timeouts* anti-Slowloris | `seguranca/cabecalhos.js`, `app.js` |
| **A06** Componentes vulneráveis | Zero dependências de terceiros; versão mínima do Node declarada em `engines` | `package.json` |
| **A07** Falhas de autenticação | Bloqueio após 5 falhas (por IP + usuário); mensagem idêntica para usuário inexistente e senha errada, com tempo de resposta igualado; expiração de sessão (8 h); logout invalida no servidor | `servicos/autenticacao.js`, `seguranca/limitador.js` |
| **A08** Integridade de software/dados | Sem *scripts* de terceiros (CSP `script-src 'self'`); sem desserialização insegura (só `JSON.parse` validado) | `seguranca/cabecalhos.js` |
| **A09** Registro e monitoramento | Log em JSON de logins (sucesso, falha, bloqueio), empréstimos e devoluções — sem registrar senhas ou tokens | `log.js` |
| **A10** SSRF | Não se aplica: o servidor não faz requisições a endereços informados pelo usuário | — |

Limitações assumidas por ser uma PoC (e como evoluir): sessões em memória (em produção, usar banco ou Redis); HTTPS fica a cargo do proxy reverso; faltam recuperação de senha, MFA e trilha de auditoria persistente.

## API
| Método | Rota | Função |
|---|---|---|
| POST | `/api/login` · `/api/logout` | Entra / sai (cookie de sessão) |
| GET | `/api/sessao` | Confere se a sessão é válida |
| GET | `/api/dashboard` · `/api/atrasos` | Indicadores e usuários em atraso |
| GET | `/api/usuarios?q=` · `/api/usuarios/:id` | Busca leitores / ficha de um leitor, com status e empréstimos ativos |
| POST · PUT · DELETE | `/api/usuarios` · `/api/usuarios/:id` | Cadastra, edita e exclui leitor |
| GET | `/api/obras?q=&genero=` | Busca no acervo com exemplares |
| GET | `/api/generos` | Gêneros cadastrados |
| POST · PUT · DELETE | `/api/obras` · `/api/obras/:id` | Cadastra, edita e exclui obra |
| POST | `/api/obras/:id/exemplares` | Adiciona exemplares |
| PATCH · DELETE | `/api/exemplares/:id` | Muda status (Disponível/Em Manutenção) ou remove exemplar |
| POST | `/api/emprestimos` | Registra empréstimo `{usuario_id, exemplar_id}` |
| POST | `/api/emprestimos/:id/devolucao` | Registra devolução (aplica suspensão se houver atraso) |

**Ao testar fora da tela (curl, Postman):** toda requisição que altera dados (POST, PUT, PATCH e DELETE), mesmo sem corpo, precisa enviar `Content-Type: application/json`; sem isso a API responde 415 (é uma das camadas anti-CSRF). Quando não há dados, envie o corpo `{}`. A sessão vai no cookie:
```bash
curl -c cookie.txt -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"matricula":"marta","senha":"bibliotech123"}'
curl -b cookie.txt http://localhost:3000/api/dashboard
curl -b cookie.txt -X POST http://localhost:3000/api/logout -H "Content-Type: application/json" -d '{}'
```

## Integrantes
Beatriz de Santana Monteiro · Eduarda Athayde Alves · Ester Neves da Silva · Laila Marina Souza Araujo · Pietra Carozzo Sena Carvalho

## Vídeo de demonstração
https://youtu.be/b0PZL4hVTko?si=erO4YI-AUodYyAdj

## Fora do escopo da PoC (próximas etapas)
Renovação e reserva, relatórios exportáveis, autoatendimento do aluno, notificações, PWA (aplicativo instalável), adequação completa à LGPD.
