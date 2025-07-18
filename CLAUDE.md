# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Retrieval-Augmented Generation (RAG) chat application that allows users to upload documents (TXT, PDF) and chat with them using AI. It's a Next.js application with a modern RAG architecture integrating vector search, embeddings, and streaming chat responses.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build the application for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint to check code quality

## Environment Setup

Required environment variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key_with_embedding_permissions
GEMINI_API_KEY=your_google_gemini_api_key
```

## Architecture

### Core Stack
- **Framework**: Next.js 15 with App Router
- **UI**: React 19 with Shadcn UI components
- **Vector Database**: Supabase (PostgreSQL with pgvector)
- **Embedding Model**: OpenAI `text-embedding-ada-002`
- **Chat LLM**: Google Gemini `gemini-1.5-flash-latest`
- **PDF Processing**: `pdfjs-dist` for client-side parsing
- **Text Chunking**: LangChain `RecursiveCharacterTextSplitter`
- **Streaming**: Custom Vercel AI SDK compatible streaming

### Key Components

**Main Chat Interface** (`app/page.tsx`):
- Split-screen layout with chat area and optional PDF viewer
- Context switching between "All Documents" and specific documents
- Web search toggle integration
- Flowing prompts sidebar for empty chat state
- Citation system with clickable references

**API Routes**:
- `/api/chat` - Handles streaming chat with RAG and optional web search
- `/api/upload` - Processes document uploads with embedding generation
- `/api/documents/[id]` - Document metadata retrieval
- `/api/pdf-content/[id]` - PDF content serving

**Database Schema** (Supabase):
- `documents` table: stores document metadata and file paths
- `document_chunks` table: stores text chunks with embeddings (vector dimension 1536)
- `match_document_chunks` function: vector similarity search with cosine distance

### RAG Pipeline

1. **Document Upload**: Client uploads PDF/TXT → server chunks text → generates embeddings → stores in Supabase
2. **Query Processing**: User query → embedding generation → vector search → context retrieval
3. **Response Generation**: Context injection into system prompt → Gemini streaming response with citations
4. **Citation System**: AI responses include numbered citations [1], [2] linking to source documents

### PDF Integration

- PDF files stored in Supabase Storage bucket `pdfs`
- Client-side PDF viewer using `react-pdf` and `pdfjs-dist`
- PDF.js worker served from `/public/pdf.worker.min.mjs`
- Context-aware PDF opening from citations

### Special Features

- **Smart RAG Search**: Skips embedding for conversational queries (greetings, simple responses)
- **Source Deduplication**: Shows one citation per document to avoid redundancy
- **Web Search Integration**: Google Search Retrieval through Gemini API when enabled
- **Blended Sources**: Combines RAG sources and web search results in unified citation system
- **Australian English**: Configured for Australian spelling conventions

## File Structure

```
app/
├── api/chat/route.ts          # RAG + streaming chat endpoint
├── api/upload/route.ts        # Document processing and storage
├── api/documents/[id]/route.ts # Document metadata API
├── api/pdf-content/[id]/route.ts # PDF content serving
├── page.tsx                   # Main chat interface
├── layout.tsx                 # Root layout
└── globals.css               # Global styles

components/
├── assistant-ui/             # Chat UI components
├── pdf-viewer.tsx           # PDF display component
├── flowing-prompts.tsx      # Welcome screen prompts
└── ui/                      # Shadcn UI components

contexts/
└── pdf-viewer-context.tsx   # PDF viewer state management

lib/
├── supabaseClient.ts        # Supabase client configuration
└── utils.ts                 # Utility functions
```

## Common Development Patterns

### Adding New Document Types
1. Extend upload API in `/api/upload/route.ts` to handle new file types
2. Add client-side parsing logic in upload components
3. Update chunking strategy if needed for specific content types

### Modifying Vector Search
- Adjust `SIMILARITY_THRESHOLD` and `MATCH_COUNT` in `/api/chat/route.ts`
- Update `match_document_chunks` database function for query modifications
- Change chunking parameters in `RecursiveCharacterTextSplitter` configuration

### Customizing Chat Behavior
- Modify system prompts in `/api/chat/route.ts`
- Adjust the `shouldSearchRAG` logic for different query types
- Update citation rendering in the `MarkdownWithCitations` component

### Database Migrations
- SQL commands for schema changes should be run in Supabase SQL Editor
- Remember to update embedding dimensions if changing OpenAI models
- Add RLS policies when implementing multi-user support