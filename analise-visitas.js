// Medição de visitas e de intenção de orçamento da Quaglicar.
//
// Objetivo: além das visitas de página (medidas pelo script do Vercel Web
// Analytics), registrar cada clique num botão que abre o WhatsApp (links wa.me)
// como um evento nomeado — é o sinal mais próximo de "pedido de orçamento" que o
// site consegue observar. A venda em si é fechada dentro do WhatsApp e não é
// visível aqui.
//
// Este arquivo é servido do próprio domínio, então passa na CSP estrita
// (script-src 'self') sem precisar afrouxar nada.

// Fila do Vercel Web Analytics. Precisa existir antes de o script de coleta
// (/_vercel/insights/script.js) processar os eventos enfileirados.
window.va = window.va || function enfileirarEventoDeAnalise() {
  (window.vaq = window.vaq || []).push(arguments);
};

// Registra um clique num botão de orçamento (que abre o WhatsApp).
function registrarCliqueDeOrcamento() {
  window.va("event", {
    name: "clicou-orcamento",
    pagina: window.location.pathname
  });
}

// Liga o rastreio a todos os links que abrem o WhatsApp (começam com wa.me).
// Em páginas sem esses links, o laço simplesmente não faz nada.
function ligarRastreioDosBotoesDeOrcamento() {
  var botoesDeOrcamento = document.querySelectorAll('a[href^="https://wa.me/"]');
  var indice = 0;
  for (indice = 0; indice < botoesDeOrcamento.length; indice = indice + 1) {
    botoesDeOrcamento[indice].addEventListener("click", registrarCliqueDeOrcamento);
  }
}

// Com o atributo defer o DOM já está pronto quando este arquivo roda; ainda
// assim protegemos contra o caso de ainda estar carregando.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ligarRastreioDosBotoesDeOrcamento);
} else {
  ligarRastreioDosBotoesDeOrcamento();
}
