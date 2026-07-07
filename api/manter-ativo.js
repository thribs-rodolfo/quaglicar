// Chamada periódica que mantém o projeto Supabase ativo — evita a pausa por
// inatividade do plano gratuito.
//
// Contexto: cada cliente do controle-chaveiro roda num projeto Supabase gratuito,
// que é PAUSADO após 7 dias sem atividade NO BANCO. Quando pausa, o app fica
// "sem conexão" e o cliente pensa que precisa reativar (ver o problema #17 do
// backlog do controle-chaveiro). Esta função faz uma leitura leve no banco de
// cada alvo, o que conta como atividade e reinicia o contador de 7 dias. É
// disparada uma vez por dia pelo agendamento da Vercel (ver "crons" no
// vercel.json) — sempre dentro da janela.
//
// Observação: esta chamada PREVINE a pausa; não RESSUSCITA um projeto já pausado
// (esse exige "Restore" manual no painel do Supabase).
//
// Variáveis de ambiente (definidas na Vercel):
//   SUPABASE_ALVOS  JSON com a lista de projetos a manter ativos. Ex.:
//                   [{"nome":"almir","url":"https://xxxx.supabase.co","chave":"sb_publishable_..."}]
//                   A "chave" é a publishable key (segura no cliente, protegida por RLS).
//                   Opcional por alvo: "tabela" (padrão: funcionarios).
//   SUPABASE_URL + SUPABASE_CHAVE   alternativa para um único alvo, sem JSON.
//   CRON_SECRET     segredo que o agendamento da Vercel envia como cabeçalho
//                   "Authorization: Bearer <valor>". Nome fixado pela plataforma.
//                   Se definido, a função só responde a quem apresentar o segredo
//                   (bloqueia acesso público). Recomendado.

// Tabela lida por padrão. Existe em todo controle-chaveiro (o login usa `funcionarios`)
// e a publishable key tem permissão de leitura nela. Pode ser trocada por alvo.
const TABELA_PADRAO = "funcionarios";

// Monta a lista de alvos a partir das variáveis de ambiente.
// Retorna { alvos, erro } — "erro" preenchido se a configuração estiver inválida.
function lerAlvos() {
  const listaBruta = process.env.SUPABASE_ALVOS;
  if (listaBruta) {
    let lista;
    try {
      lista = JSON.parse(listaBruta);
    } catch (falha) {
      return { alvos: null, erro: `SUPABASE_ALVOS não é um JSON válido: ${falha.message}` };
    }
    if (!Array.isArray(lista)) {
      return { alvos: null, erro: "SUPABASE_ALVOS precisa ser uma lista (array) de alvos" };
    }
    return { alvos: lista, erro: null };
  }
  // Alvo único como alternativa ao JSON.
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_CHAVE;
  if (url && chave) {
    return { alvos: [{ nome: "principal", url, chave }], erro: null };
  }
  return {
    alvos: null,
    erro: "nenhum alvo configurado: defina SUPABASE_ALVOS (JSON) ou SUPABASE_URL + SUPABASE_CHAVE",
  };
}

// Faz uma leitura leve num alvo. Sempre retorna um resultado descritivo — nunca lança —
// para que a falha de um alvo não derrube a verificação dos demais.
async function verificarAlvo(alvo) {
  const nome = alvo && alvo.nome ? alvo.nome : "(sem nome)";
  if (!alvo || !alvo.url || !alvo.chave) {
    return { nome, ok: false, detalhe: "alvo sem url ou chave" };
  }
  const tabela = alvo.tabela || TABELA_PADRAO;
  const enderecoConsulta = `${alvo.url.replace(/\/$/, "")}/rest/v1/${tabela}?select=id&limit=1`;
  try {
    const resposta = await fetch(enderecoConsulta, {
      method: "GET",
      headers: {
        apikey: alvo.chave,
        Authorization: `Bearer ${alvo.chave}`,
      },
    });
    // Qualquer resposta do PostgREST significa que o banco executou a consulta —
    // já conta como atividade. Reportamos o status para visibilidade.
    return { nome, ok: resposta.ok, status: resposta.status };
  } catch (falha) {
    // Falha de rede, projeto já pausado ou URL errada — reporta, não engole.
    return { nome, ok: false, detalhe: falha.message };
  }
}

module.exports = async (req, res) => {
  // Proteção: se CRON_SECRET estiver definido, exige "Authorization: Bearer <segredo>".
  // O agendamento da Vercel envia esse cabeçalho automaticamente quando a env existe.
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const cabecalho = req.headers["authorization"] || "";
    if (cabecalho !== `Bearer ${segredo}`) {
      res.status(401).json({ ok: false, erro: "não autorizado" });
      return;
    }
  }

  const { alvos, erro } = lerAlvos();
  if (erro) {
    // Configuração inválida é erro real — 500 e mensagem clara, sem silenciar.
    res.status(500).json({ ok: false, erro });
    return;
  }

  // Em paralelo: verificarAlvo nunca lança, então Promise.all não rejeita.
  const resultados = await Promise.all(alvos.map(verificarAlvo));

  for (const resultado of resultados) {
    // Registro nos logs da função (sem expor a chave).
    console.log(
      `manter-ativo ${resultado.nome}:`,
      JSON.stringify({ ok: resultado.ok, status: resultado.status, detalhe: resultado.detalhe })
    );
  }

  const todosOk = resultados.every((r) => r.ok);
  // 200 se todos os alvos responderam; 500 se algum falhou (para a Vercel sinalizar).
  res.status(todosOk ? 200 : 500).json({
    ok: todosOk,
    momento: new Date().toISOString(),
    total: resultados.length,
    resultados,
  });
};
