// Estrutura do banco de dados. As restrições (CHECK, UNIQUE, FOREIGN KEY) são a última linha
// de defesa: mesmo que um bug passe pela aplicação, o banco não aceita dados inválidos.

function aplicarEsquema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nome         TEXT NOT NULL,
      matricula    TEXT NOT NULL UNIQUE,
      perfil       TEXT NOT NULL CHECK (perfil IN ('aluno', 'professor', 'admin')),
      turma        TEXT,
      senha_hash   TEXT,            -- só a conta admin tem senha; nunca guardamos a senha em texto
      suspenso_ate TEXT             -- AAAA-MM-DD; nulo = sem suspensão
    );

    CREATE TABLE IF NOT EXISTS obras (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo      TEXT NOT NULL,
      autor       TEXT NOT NULL,
      isbn        TEXT,
      genero      TEXT,
      localizacao TEXT
    );

    CREATE TABLE IF NOT EXISTS exemplares (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      obra_id INTEGER NOT NULL REFERENCES obras (id),
      codigo  TEXT NOT NULL UNIQUE,
      status  TEXT NOT NULL DEFAULT 'Disponível'
              CHECK (status IN ('Disponível', 'Emprestado', 'Em Manutenção'))
    );

    CREATE TABLE IF NOT EXISTS emprestimos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id      INTEGER NOT NULL REFERENCES usuarios (id),
      exemplar_id     INTEGER NOT NULL REFERENCES exemplares (id),
      data_emprestimo TEXT NOT NULL,
      data_prevista   TEXT NOT NULL,
      data_devolucao  TEXT           -- nulo = ainda emprestado
    );

    -- Um exemplar físico não pode estar em dois empréstimos abertos ao mesmo tempo.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_emprestimo_aberto_por_exemplar
      ON emprestimos (exemplar_id) WHERE data_devolucao IS NULL;
    CREATE INDEX IF NOT EXISTS ix_emprestimo_usuario ON emprestimos (usuario_id);
  `);
}

module.exports = { aplicarEsquema };
