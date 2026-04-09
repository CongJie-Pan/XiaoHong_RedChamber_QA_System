# 🔴 XiaoHong Ancient Chinese QA System (小紅古典文學問答系統)

[English Version](#english-version) | [中文版本](#繁體中文版本)

---

## 繁體中文版本

### 系統簡介
**XiaoHong Ancient Chinese QA System (小紅古典文學問答系統)** 是一個基於檢索增強生成 (Retrieval-Augmented Generation, RAG) 架構建構的古典文學與國學常識問答系統。本專案為 NSTC (國科會) 學術研究計畫的一部分。
本系統分為兩個主要微服務：
- **Frontend (前端)**：以 Next.js 建構的現代化聊天介面，支援串流 (Streaming) 顯示與文獻溯源卡片。
- **Backend (後端)**：以 FastAPI 構建的後端微服務，負責處理 RAG 融合檢索 (FAISS + BM25) 以及大語言模型 (LLM) 推理。

### 目錄結構
```
XiaoHong_RedChamber_QA_System/
├── frontend/             # Next.js 前端網頁介面
├── backend/              # FastAPI 後端 RAG 服務
├── src/main/python/      # 核心 RAG 與檢索服務套件
└── data/rag/             # 檢索索引檔案放置處 (FAISS / BM25)
```

### 逐步運行指南 (Step-by-Step Setup Guide)

#### 1. 前置作業 (資料索引)
為避免版權或檔案過大問題，本專案不自帶資料模型。請在啟動前，將您的索引檔放至對應目錄：
- **FAISS Index**: 請將 `chunks.index` 及 `index_metadata.json` 放入 `data/rag/faiss_index/`
- **BM25 Index**: 請將 `bm25_index.pkl` 放入 `data/rag/bm25_index/`
> **注意**: 如果沒有放入資料，後端依然可以啟動，但會給出 Warning 並進入「無 RAG」的純聊天模式。

#### 2. 後端啟動 (Backend)
請確保您已安裝 Python 3.9+。
```bash
cd backend
# 建議使用虛擬環境
# python -m venv .venv
# source .venv/bin/activate (或 .venv\Scripts\activate)

# 安裝依賴
pip install -r requirements.txt
pip install fastapi uvicorn pydantic python-dotenv openai transformers faiss-cpu

# 複製並設定環境變數
cp .env.local.example .env.local # 若有範例檔
# 請在 .env.local 中填寫 HF_ENDPOINT_URL 與 HF_TOKEN 若您使用 HuggingFace Inference Endpoints
# 或者設定 OPENROUTER_API_KEY 用於 Embedding

# 啟動伺服器
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 3. 前端啟動 (Frontend)
請確保您已安裝 Node.js (建議 v18+)。
```bash
cd frontend

# 安裝依賴
npm install

# 配置環境變數
cp .env.local.example .env.local
# 檢查 .env.local 內的 NEXT_PUBLIC_API_URL 是否正確指向後端 (例如 http://127.0.0.1:8000)

# 啟動開發伺服器
npm run dev
```
啟動完成後，請打開瀏覽器造訪 [http://localhost:3000](http://localhost:3000)。

---

## English Version

### System Introduction
**XiaoHong Ancient Chinese QA System** is a platform for answering questions about Classical Chinese Literature and sinology, powered by a Retrieval-Augmented Generation (RAG) architecture. This project is a constituent of an NSTC academic research proposal.
The system is cleanly decoupled into two microservices:
- **Frontend**: A modernized Next.js chat interface that supports streaming responses and citation tracking.
- **Backend**: A FastAPI microservice responsible for hybrid retrieval (FAISS + BM25) and Large Language Model (LLM) inference.

### Directory Structure
```
XiaoHong_RedChamber_QA_System/
├── frontend/             # Next.js Web Interface
├── backend/              # FastAPI RAG Service 
├── src/main/python/      # Core retrieval and RAG service modules
└── data/rag/             # Target directory for retrieval indices (FAISS/BM25)
```

### Step-by-Step Setup Guide

#### 1. Prerequisites (Data Indexes)
To respect file size limits and data privacy, large data models are not tracked. Before starting the backend, place your indices in the reserved directories:
- **FAISS Index**: Put your `chunks_qwen*.index` and `index_metadata_qwen*.json` in `data/rag/faiss_index/`
- **BM25 Index**: Put your `bm25_index.pkl` inside `data/rag/bm25_index/`
> **Note**: If you don't provide the local indices, the backend will still gracefully start (yielding a Warning) and fall back to a no-RAG chat mode.

#### 2. Starting the Backend
Requires Python 3.9+.
```bash
cd backend
# Recommended to use a Virtual Environment
# python -m venv .venv
# source .venv/bin/activate (or .venv\Scripts\activate on Windows)

# Install Dependencies
pip install -r requirements.txt
pip install fastapi uvicorn pydantic python-dotenv openai transformers faiss-cpu

# Configure Environment Variables
cp .env.local.example .env.local # if an example exists
# Fill in HF_ENDPOINT_URL and HF_TOKEN in .env.local for standard LLM generation
# Also set OPENROUTER_API_KEY for embedding generation

# Run the Server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 3. Starting the Frontend
Requires Node.js (v18+ recommended).
```bash
cd frontend

# Install Dependencies
npm install

# Configure Environment Variables
cp .env.local.example .env.local
# Make sure NEXT_PUBLIC_API_URL effectively points to your backend (e.g. http://127.0.0.1:8000)

# Start the Dev Server
npm run dev
```
Finally, open your browser and navigate to [http://localhost:3000](http://localhost:3000).
