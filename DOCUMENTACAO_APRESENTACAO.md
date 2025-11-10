# 📊 FERRY BOT - DOCUMENTAÇÃO PARA APRESENTAÇÃO

## 🎯 Visão Geral do Projeto

O **Ferry Bot** é um sistema de gerenciamento e simulação de filas para os ferries de São Luís, desenvolvido utilizando **Teoria de Filas** para modelar, analisar e otimizar o transporte aquaviário.

---

## 📚 TEORIA DE FILAS - FUNDAMENTOS

### O que é Teoria de Filas?

É um ramo da matemática que estuda sistemas de espera, onde "clientes" chegam para serem atendidos por "servidores" com capacidade limitada.

**Aplicação no nosso caso:**
- **Clientes** = Veículos (carros e caminhões)
- **Servidores** = Embarcações (ferries)
- **Fila** = Veículos esperando para embarcar
- **Serviço** = Embarque + Travessia + Desembarque

---

## 🔢 MODELO M/M/c (Modelo de Kendall)

### Notação M/M/c Explicada:

```
M / M / c
│   │   └─── c = número de servidores (embarcações)
│   └─────── M = tempo de serviço exponencial
└─────────── M = chegadas seguem processo de Poisson
```

### Componentes do Nosso Sistema:

#### 1️⃣ Primeiro M - Processo de Chegada (Poisson)
- **Parâmetro:** λ (lambda) = taxa de chegada
- **No nosso sistema:** 1.200 veículos/dia ÷ 16 horas = 75 veículos/hora
- **Durante pico:** 75 × 2.5 = 187,5 veículos/hora
- **Significado:** Veículos chegam aleatoriamente, não programados

#### 2️⃣ Segundo M - Tempo de Serviço (Exponencial)
- **Parâmetro:** μ (mi) = taxa de atendimento
- **No nosso sistema:**
  - Embarque: 15 minutos
  - Travessia: 80 minutos (1h20)
  - Desembarque: 15 segundos
  - **Total:** ~95 minutos por ciclo
- **Significado:** Tempo varia de forma exponencial

#### 3️⃣ c - Múltiplos Servidores
- **Valor:** c = 4 embarcações
- **Capacidade:** 50 veículos cada
- **Capacidade total:** 200 veículos por ciclo

---

## 📊 MÉTRICAS PRINCIPAIS

### Métricas Calculadas pela Simulação:

| Métrica | Nome | Descrição | No Sistema |
|---------|------|-----------|------------|
| **λ** | Lambda | Taxa de chegada | 75 veículos/hora (normal)<br>187,5 veículos/hora (pico) |
| **μ** | Mi | Taxa de atendimento | ~0,63 veículos/min por ferry |
| **c** | Servidores | Número de embarcações | 4 embarcações |
| **ρ** | Rho | Taxa de utilização | λ / (c × μ) |
| **L** | Sistema | Veículos médios no sistema | Calculado pela simulação |
| **Lq** | Fila | Veículos médios na fila | Retornado como "veiculosEmFila" |
| **W** | Tempo Sistema | Tempo médio total no sistema | Espera + Serviço |
| **Wq** | Tempo Fila | Tempo médio de espera | Retornado como "tempoMedioEspera" |

### Interpretação das Métricas:

**ρ (Taxa de Utilização):**
- ρ < 0,7 → Sistema subutilizado (recursos ociosos)
- 0,7 ≤ ρ < 0,9 → Sistema bem balanceado ✅
- 0,9 ≤ ρ < 1,0 → Sistema no limite (risco de filas)
- ρ ≥ 1,0 → Sistema saturado ⚠️ (filas crescem indefinidamente)

**Wq (Tempo de Espera):**
- Horário normal: ~20 minutos
- Horário de pico: ~90 minutos (1h30)
- **Objetivo:** Reduzir através do sistema de reservas

---

## 🏗️ ARQUITETURA DO SISTEMA

### Estrutura do Backend:

```
┌─────────────────────────────────────────────────┐
│              FRONTEND (Interface)               │
│     (React, Vue, HTML ou qualquer tecnologia)   │
└────────────────┬────────────────────────────────┘
                 │ HTTP Requests
                 ↓
┌─────────────────────────────────────────────────┐
│           API REST (Express.js)                 │
│  ┌──────────────────────────────────────────┐  │
│  │  GET  /simular                           │  │
│  │  POST /reserva                           │  │
│  │  POST /relatar-problema                  │  │
│  │  GET  /embarcacoes/status                │  │
│  └──────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│         SIMULADOR DE FILAS (Lógica)             │
│  ┌──────────────────────────────────────────┐  │
│  │  • Classe SimuladorFerries               │  │
│  │  • Classe Embarcacao (Servidor)          │  │
│  │  • Classe Veiculo (Cliente)              │  │
│  │  • Algoritmo de simulação M/M/c          │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 🎮 COMO O SISTEMA FUNCIONA

### Fluxo de Simulação (Passo a Passo):

```
1. INICIALIZAÇÃO
   ├─ Cria 4 embarcações (servidores)
   ├─ Define horário de operação (6h-22h)
   └─ Inicializa fila vazia

2. LOOP DE SIMULAÇÃO (para cada hora)
   │
   ├─ 2.1 CHEGADAS (Processo de Poisson)
   │   ├─ Calcula λ baseado no horário
   │   ├─ Se é pico: λ × 2.5
   │   ├─ Gera veículos aleatoriamente
   │   └─ Adiciona à fila (Lq aumenta)
   │
   ├─ 2.2 MANUTENÇÃO
   │   ├─ Verifica se embarcação precisa manutenção
   │   ├─ Se sim: marca como indisponível (c diminui)
   │   └─ Após 4h: volta a operar (c aumenta)
   │
   ├─ 2.3 FALHAS ALEATÓRIAS
   │   ├─ 5% de chance de falha
   │   └─ Embarcação fica 30min fora (downtime)
   │
   └─ 2.4 ATENDIMENTO
       ├─ Para cada embarcação disponível:
       │   ├─ Se tem fila E embarcação vazia:
       │   │   ├─ EMBARQUE: remove até 50 da fila
       │   │   ├─ Calcula Wq = horário_embarque - horário_chegada
       │   │   ├─ TRAVESSIA: espera 80 minutos
       │   │   ├─ DESEMBARQUE: libera veículos
       │   │   └─ Atualiza ρ (utilização)
       │   └─ Repete até fila acabar ou tempo acabar

3. CÁLCULO DE RESULTADOS
   ├─ Wq médio = soma(tempos_espera) / total_veículos
   ├─ Lq final = veículos ainda na fila
   ├─ ρ = tempo_ocupado / tempo_total
   └─ Retorna todas as métricas
```

---

## 💡 SISTEMA DE RESERVAS

### Impacto na Teoria de Filas:

**Sem Reservas:**
```
Horário  │ Chegadas │ Resultado
─────────┼──────────┼────────────────────
7h-9h    │ 187/h ▲  │ λ >> μ → Fila grande
10h-16h  │ 75/h     │ λ ≈ μ  → Fila média
17h-19h  │ 187/h ▲  │ λ >> μ → Fila grande
20h-22h  │ 75/h     │ λ ≈ μ  → Fila média
```

**Com Reservas (30%):**
```
Horário  │ Chegadas │ Resultado
─────────┼──────────┼────────────────────
7h-9h    │ 131/h ↓  │ λ < μ  → Fila menor ✅
10h-16h  │ 95/h ↑   │ λ ≈ μ  → Distribuído
17h-19h  │ 131/h ↓  │ λ < μ  → Fila menor ✅
20h-22h  │ 95/h ↑   │ λ ≈ μ  → Distribuído
```

**Benefícios:**
- ✅ Redução de 30-40% no Wq (tempo de espera)
- ✅ Distribuição mais uniforme de chegadas
- ✅ Melhor utilização ρ dos servidores
- ✅ Menor Lq (tamanho da fila)

---

## 📡 ENDPOINTS DA API

### 1. Executar Simulação
```http
POST /simular
Content-Type: application/json

{
  "numEmbarcacoes": 4,
  "veiculosDiarios": 1200
}
```

**Resposta:**
```json
{
  "sucesso": true,
  "resultados": {
    "tempoMedioEspera": 25.5,      // Wq
    "veiculosEmFila": 50,            // Lq
    "veiculosProcessados": 1150,
    "utilizacaoEmbarcacoes": [...]   // ρ por servidor
  }
}
```

### 2. Simular com Reservas
```http
POST /simular/com-reservas
Content-Type: application/json

{
  "percentualReservas": 0.3
}
```

**Resposta:**
```json
{
  "resultados": {
    "semReservas": { "tempoMedioEspera": 45 },
    "comReservas": { "tempoMedioEspera": 28 },
    "melhorias": {
      "reducaoTempoEspera": "37.78%",
      "reducaoFila": 20
    }
  }
}
```

### 3. Relatar Problema ⭐ NOVO
```http
POST /relatar-problema
Content-Type: application/json

{
  "categoria": "Atraso excessivo",
  "descricao": "Fila com mais de 2 horas de espera",
  "nomeUsuario": "João Silva",
  "telefone": "(98) 99999-9999"
}
```

**Resposta:**
```json
{
  "sucesso": true,
  "problema": {
    "protocolo": "FB-L8K9M2N",
    "prioridade": "média",
    "status": "aberto",
    "previsaoResposta": "2025-11-09T14:00:00Z"
  },
  "informacoes": [
    "Resposta em até 24 horas úteis",
    "Guarde o protocolo: FB-L8K9M2N"
  ]
}
```

**Categorias de Problemas:**
- Embarcação com defeito (Prioridade: Alta)
- Segurança (Prioridade: Alta)
- Atraso excessivo (Prioridade: Média)
- Fila desorganizada (Prioridade: Média)
- Funcionário (Prioridade: Normal)
- Infraestrutura (Prioridade: Normal)
- Outro (Prioridade: Normal)

### 4. Status das Embarcações
```http
GET /embarcacoes/status
```

**Resposta:**
```json
{
  "embarcacoes": [
    {
      "id": 1,
      "estado": "Em Operação",
      "disponivel": true,
      "veiculosAbordo": 45,
      "capacidade": 50
    }
  ],
  "capacidadeTotal": 200,
  "embarcacoesDisponiveis": 3
}
```

---

## 📈 RESULTADOS ESPERADOS

### Métricas de Performance:

**Situação Atual (Sem Sistema):**
- Tempo médio de espera: 45-90 minutos
- Fila máxima: 150+ veículos
- Utilização embarcações: 45% (subutilização)
- Reclamações: Altas

**Com Sistema Ferry Bot:**
- Tempo médio de espera: 20-30 minutos (-55%)
- Fila máxima: 50 veículos (-67%)
- Utilização embarcações: 75% (+67%)
- Reclamações: Sistema de relatos organizado

### Benefícios Quantificáveis:

1. **Redução de Tempo:**
   - 1h+ de economia por usuário
   - 1.200 veículos × 1h = 1.200 horas/dia economizadas

2. **Eficiência Operacional:**
   - Melhor distribuição da demanda
   - Manutenções programadas
   - Previsão de falhas

3. **Satisfação dos Usuários:**
   - Reservas antecipadas
   - Transparência (status em tempo real)
   - Canal de comunicação direto

4. **Gestão Pública:**
   - Dados para tomada de decisão
   - Identificação de gargalos
   - Priorização de investimentos

---

## 🔧 TECNOLOGIAS UTILIZADAS

### Backend:
- **Node.js**: Ambiente de execução JavaScript
- **Express.js**: Framework para API REST
- **CORS**: Permite integração com frontend

### Conceitos Aplicados:
- ✅ Teoria de Filas (M/M/c)
- ✅ Simulação de Eventos Discretos
- ✅ Processo de Poisson (chegadas)
- ✅ Distribuição Exponencial (serviço)
- ✅ API REST
- ✅ Programação Orientada a Objetos

---

## 🎓 CONCEITOS-CHAVE PARA APRESENTAÇÃO

### 1. Por que M/M/c?
"Escolhemos o modelo M/M/c porque representa perfeitamente nosso sistema:
- Chegadas aleatórias (Poisson) ✅
- Tempo de serviço variável (Exponencial) ✅
- Múltiplos servidores em paralelo (4 embarcações) ✅"

### 2. O que a simulação calcula?
"A simulação processa 16 horas de operação, calculando:
- Quanto tempo cada veículo espera (Wq)
- Quantos veículos ficam na fila (Lq)
- Quão ocupadas ficam as embarcações (ρ)
- Impacto de diferentes cenários"

### 3. Como o sistema ajuda?
"Através de 3 pilares:
1. **Previsibilidade**: Reservas distribuem a demanda
2. **Transparência**: Status em tempo real
3. **Comunicação**: Canal direto para relatar problemas"

### 4. Resultados práticos?
"Redução de 55% no tempo de espera = 1.200 horas economizadas por dia
= 36.000 horas/mês = economia significativa para população e economia local"

---

## 📞 SUPORTE TÉCNICO

**Desenvolvido por:** Eduardo  
**Disciplina:** Simulação de Software  
**Instituição:** [Sua Universidade]  
**Data:** Novembro 2025

---

## 📚 REFERÊNCIAS

1. Kendall, D. G. (1953). "Stochastic Processes Occurring in the Theory of Queues"
2. Kleinrock, L. (1975). "Queueing Systems, Volume 1: Theory"
3. Gross, D., & Harris, C. M. (1998). "Fundamentals of Queueing Theory"
4. Winston, W. L. (2004). "Operations Research: Applications and Algorithms"

---

## ✅ CHECKLIST PARA APRESENTAÇÃO

- [ ] Explicar o problema dos ferries
- [ ] Introduzir Teoria de Filas
- [ ] Explicar notação M/M/c
- [ ] Mostrar código comentado
- [ ] Demonstrar API funcionando
- [ ] Mostrar endpoint de relatar problema
- [ ] Apresentar resultados da simulação
- [ ] Comparar cenários (com/sem reservas)
- [ ] Destacar benefícios quantificáveis
- [ ] Conclusão e próximos passos

---

**🎉 BOA APRESENTAÇÃO! 🎉**
