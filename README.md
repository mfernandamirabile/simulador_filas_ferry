# 🚀 GUIA RÁPIDO - FERRY BOT

## ⚡ Instalação em 3 Passos

### 1️⃣ Extrair o arquivo
```bash
tar -xzf ferry-bot-completo-comentado.tar.gz
cd ferry-bot-completo-comentado
```

### 2️⃣ Instalar dependências
```bash
npm install
```

### 3️⃣ Rodar o servidor
```bash
node ferry-backend-comentado.js
```

✅ **Pronto!** O servidor está rodando em `http://localhost:3000`

---

## 📋 Arquivos Incluídos

1. **ferry-backend-comentado.js** 
   - Backend completo com TODOS os comentários explicativos
   - Explicação da Teoria de Filas linha por linha
   - Endpoint de relatar problema incluído

2. **DOCUMENTACAO_APRESENTACAO.md**
   - Guia completo para apresentação
   - Explicação da teoria M/M/c
   - Métricas e interpretações
   - Checklist de apresentação

3. **EXEMPLOS_JSON_THUNDER_CLIENT.txt**
   - +40 exemplos de JSON prontos para copiar e colar
   - Exemplos para TODOS os endpoints
   - 8 exemplos diferentes de relatar problema
   - Instruções de uso no Thunder Client

---

## 🧪 Teste Rápido

Abra o Thunder Client e teste:

### Teste 1: API funcionando
```
GET http://localhost:3000/
```

### Teste 2: Executar simulação
```
POST http://localhost:3000/simular
Body: {}
```

### Teste 3: Relatar problema (como no formulário)
```
POST http://localhost:3000/relatar-problema
Body: {
  "categoria": "Atraso excessivo",
  "descricao": "Fila com mais de 2 horas de espera"
}
```

---

## 📊 Teoria de Filas - Resumo Rápido

**Modelo M/M/c:**
- **M** = Chegadas aleatórias (Poisson)
- **M** = Tempo de serviço exponencial
- **c** = 4 embarcações (servidores)

**Métricas Principais:**
- **Wq** = Tempo médio de espera na fila
- **Lq** = Número médio de veículos na fila
- **ρ** = Taxa de utilização das embarcações

**Objetivo:**
Minimizar Wq e Lq mantendo ρ entre 0.7-0.9 (eficiente mas não saturado)

---

