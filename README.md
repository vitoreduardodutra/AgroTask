# 🌱 AgroTask

Sistema web de **gestão de tarefas rurais**, com foco em organização, execução, acompanhamento e validação de atividades no campo.

---

## 🚀 Como rodar o projeto

### ✅ Pré-requisitos

Antes de começar, você precisa ter instalado:

* Git
* Node.js + npm
* Docker Desktop

---

## ⚙️ Passo a passo

### 1. Clone o repositório

```bash
git clone URL_DO_REPOSITORIO
cd AgroTask
```

---

### 2. Crie os arquivos `.env`

O projeto utiliza variáveis de ambiente no backend e no frontend.

Crie os arquivos `.env` com base nos arquivos de exemplo:

#### Linux / macOS

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

#### Windows PowerShell

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

---

### 3. Suba o backend + banco com Docker

```bash
docker compose up -d
```

---

### 4. Rode o frontend

```bash
cd frontend
npm install
npm run dev
```

---

### 5. Acesse o sistema

* Frontend: http://localhost:5173
* Backend: http://localhost:3001

---

## ⚠️ Variáveis de ambiente

Os arquivos `.env.example` já possuem configurações básicas para ambiente local.

Você pode rodar o sistema apenas copiando esses arquivos para `.env`.

No entanto, sem alterar algumas variáveis, **algumas funcionalidades podem não funcionar corretamente**, como:

* login com Google
* envio de e-mails (recuperação de senha)

Mesmo assim, isso **não impede o uso geral do sistema para testes**, como:

* login padrão
* criação e gerenciamento de tarefas
* navegação no sistema

---

## 🧪 Problemas comuns

### Porta já está em uso

Feche o processo que está usando a porta ou altere a configuração local.

### Erro ao conectar no banco

Verifique se o Docker Desktop está rodando corretamente.

### Frontend não conecta no backend

Confira se os arquivos `.env` foram criados corretamente.

---

## 📌 Estrutura do projeto

```bash
AgroTask/
├── backend/
├── frontend/
├── docker-compose.yml
└── README.md
```

---

## 👥 Sobre o projeto

Projeto acadêmico desenvolvido para melhorar a organização e a rastreabilidade de tarefas no ambiente rural.
