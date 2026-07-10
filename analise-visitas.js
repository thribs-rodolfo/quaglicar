// Medição de intenção de orçamento da Quaglicar.
//
// Registra cada clique num botão de "chamar no WhatsApp" como um evento nomeado
// do Vercel Web Analytics — é o sinal mais próximo de "pedido de orçamento" que
// o site consegue observar. A venda em si é fechada dentro do WhatsApp e não é
// visível aqui.
//
// Servido do próprio domínio: passa na CSP estrita (script-src 'self') sem
// afrouxar nada. Não usamos preventDefault — se a medição falhar, o link do
// WhatsApp ainda abre normalmente.

if (typeof window === "undefined")
{
  throw new Error(
    "parâmetro window ausente. Verifique se o programa está sendo executado em navegador de Internet",
  )
}

const { va: vercelAnalytics = null } = window ?? {}

// Fila provisória do Vercel Web Analytics: enquanto o script real de coleta
// (/_vercel/insights/script.js) não carrega, guardamos cada evento em
// window.vaq; ao carregar, o Vercel esvazia essa fila. A fila é CRIADA quando
// ainda não existe — sua ausência é o estado normal no início da página.
function enfileirarEventoDeAnalise(tipo, corpo)
{
  if (typeof tipo !== "string")
  {
    throw new Error("tipo de evento inválido")
  }
  if (!window.vaq)
  {
    window.vaq = []
  }
  window.vaq.push([tipo, corpo])
}

// Só instala a fila provisória se o Vercel ainda não tiver colocado a função
// real de coleta no lugar.
if (vercelAnalytics === null)
{
  window.va = enfileirarEventoDeAnalise
}

// Handler de clique: lê a ação declarada no próprio elemento (data-acao) e o
// caminho da página, e registra o evento. currentTarget é o elemento que tem o
// ouvinte (o dono do data-acao), não um filho eventualmente clicado.
function registrarCliqueDeChamarWhatsapp(evento)
{
  const acao = evento?.currentTarget?.dataset?.acao ?? null
  if (acao === null)
  {
    throw new Error("parâmetro acao ausente. O elemento clicado precisa do atributo data-acao")
  }
  const { location: { pathname: caminho = null } = {} } = window ?? {}
  if (caminho === null)
  {
    throw new Error("parâmetro caminho ausente. Verifique se o programa está sendo executado em navegador de Internet")
  }
  window.va("event", {
    name: "clique-" + acao,
    caminho,
  })
}

if (typeof document === "undefined")
{
  throw new Error(
    "parâmetro document ausente. Verifique se o programa está sendo executado em navegador de Internet",
  )
}

// Liga o rastreio aos botões marcados como ação de chamar no WhatsApp. Seletor
// por data-acao (não por âncora/href): funciona em <a>, <button> ou qualquer
// elemento, e independe do formato do link.
function ligarRastreioDosBotoesDeChamarWhatsapp()
{
  const botoesDeChamarWhatsapp = document.querySelectorAll('[data-acao="chamar-whatsapp"]')
  for (let indice = 0; indice < botoesDeChamarWhatsapp.length; indice++)
  {
    botoesDeChamarWhatsapp[indice].addEventListener("click", registrarCliqueDeChamarWhatsapp)
  }
}

// Com defer o DOM já está pronto quando este arquivo roda; ainda assim cobrimos
// os dois ramos — sem o else, em página já carregada o rastreio nunca ligaria.
if (document.readyState === "loading")
{
  document.addEventListener("DOMContentLoaded", ligarRastreioDosBotoesDeChamarWhatsapp)
}
else
{
  ligarRastreioDosBotoesDeChamarWhatsapp()
}
