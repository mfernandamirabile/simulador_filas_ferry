// ============================================================================
// FERRY BOT - MÓDULO DE RELATÓRIOS (versão corrigida e aprimorada)
// ============================================================================
// Gera relatórios consolidados a partir do simulador do ferry-backend.
// Evita valores negativos e percentuais acima de 100%.
// ============================================================================

let SimuladorFerries; // declaração vazia

function setSimuladorClasse(classe) {
  SimuladorFerries = classe;
}

class GeradorRelatorios {
  static gerarRelatorio() {
    try {
      // Executa simulação normal
      const simuladorNormal = new SimuladorFerries();
      const resultadoSemReserva = simuladorNormal.processar();

      // Executa simulação com reservas (30%)
      const simuladorComReserva = new SimuladorFerries();
      const resultadoComReserva = simuladorComReserva.simularComReservas(0.3).comReservas;

      // --- Cálculos de médias e comparações reais ---
      const tempoMedioSem = Math.max(0, resultadoSemReserva.tempoMedioEspera);
      const tempoMedioCom = Math.max(0, resultadoComReserva.tempoMedioEspera);

      const utilizacaoMediaSem = this._mediaUtilizacao(resultadoSemReserva.utilizacaoEmbarcacoes);
      const utilizacaoMediaCom = this._mediaUtilizacao(resultadoComReserva.utilizacaoEmbarcacoes);

      const reducaoTempoEspera = ((tempoMedioSem - tempoMedioCom) / tempoMedioSem) * 100 || 0;
      const melhoriaUtilizacao = utilizacaoMediaCom - utilizacaoMediaSem;

      // --- Nova seção: Análise de manutenção ---
      const manutencaoInfo = this._analisarManutencao(resultadoSemReserva);

      const relatorio = {
        dataGeracao: new Date().toLocaleString("pt-BR"),
        resumoGeral: {
          tempoMedioEspera: `${tempoMedioSem.toFixed(2)} min`,
          veiculosProcessados: resultadoSemReserva.veiculosProcessados,
          utilizacaoMedia: `${utilizacaoMediaSem.toFixed(2)}%`,
          viagensRealizadas: resultadoSemReserva.viagensRealizadas,
        },
        comparativoReservas: {
          reducaoTempoEspera: `${reducaoTempoEspera.toFixed(2)}%`,
          melhoriaUtilizacao: `${melhoriaUtilizacao.toFixed(2)}%`,
          veiculosProcessadosComReservas: resultadoComReserva.veiculosProcessados,
          tempoMedioComReservas: `${tempoMedioCom.toFixed(2)} min`,
        },
        manutencao: manutencaoInfo, // 🔧 nova seção adicionada
        detalhesServidores: resultadoSemReserva.utilizacaoEmbarcacoes.map((e) => ({
          embarcacao: e.id,
          utilizacao: `${Math.min(100, e.percentualUtilizacao).toFixed(2)}%`,
          viagens: e.viagensRealizadas,
        })),
      };

      return { sucesso: true, mensagem: "Relatório gerado com sucesso", relatorio };
    } catch (erro) {
      console.error("Erro ao gerar relatório:", erro);
      return { sucesso: false, erro: erro.message };
    }
  }

  // === MÉTODOS AUXILIARES ===

  static _mediaUtilizacao(lista) {
    if (!lista || lista.length === 0) return 0;
    const soma = lista.reduce((acc, e) => acc + Math.min(100, e.percentualUtilizacao), 0);
    return soma / lista.length;
  }

  // 🔧 Novo método: Análise de manutenção
  static _analisarManutencao(resultado) {
    const eventos = resultado.eventos || [];
    const manutencoes = eventos.filter(e => e.tipo === "manutencao_inicio");

    if (manutencoes.length === 0) {
      return {
        manutencoesRealizadas: 0,
        totalHoras: 0,
        percentualIndisponibilidade: "0%",
        impactoEstimado: "Sem impacto relevante detectado"
      };
    }

    const horasPorEvento = 4; // conforme config padrão
    const totalHoras = manutencoes.length * horasPorEvento;
    const tempoTotalSimulacao = resultado.tempoSimulacao * 60; // em minutos
    const indisponibilidadePercentual = (totalHoras * 60 / tempoTotalSimulacao / 4) * 100; // 4 embarcações

    // impacto estimado: proporcional ao tempo fora de operação
    const impactoEstimado = `Aumento estimado de ${(indisponibilidadePercentual * 0.8).toFixed(2)}% no tempo médio de espera`;

    return {
      manutencoesRealizadas: manutencoes.length,
      totalHoras,
      percentualIndisponibilidade: `${indisponibilidadePercentual.toFixed(2)}%`,
      impactoEstimado
    };
  }
}

module.exports = { GeradorRelatorios, setSimuladorClasse };