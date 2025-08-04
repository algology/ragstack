# Gemini Project Context: ragstack

## Project Overview

This is a Next.js application that serves as a template for building chat applications using the Retrieval-Augmented Generation (RAG) model. It allows users to upload documents (specifically TXT and PDF files) and interact with them through a chat interface. The backend is set up to handle file parsing, text chunking, embedding generation, and vector similarity searches to provide contextually relevant answers from the documents.

## Tech Stack

- **Framework:** Next.js (using the App Router)
- **UI:** React with Shadcn UI
- **Vector Database:** Supabase (PostgreSQL with the pgvector extension)
- **Embedding Model:** OpenAI's `text-embedding-ada-002`
- **Chat LLM:** Groq's `llama3-8b-8192`
- **Core Logic:**
    - Client-side PDF/TXT parsing using `pdfjs-dist`.
    - Text chunking with `langchain`.
    - Embedding generation via the OpenAI API.
    - Vector similarity search using a Supabase function.
    - Streaming chat responses with the Vercel AI SDK (`useChat`).

## Project Setup and Commands

### Installation

To get started, clone the repository and install the dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root with the following variables:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key_with_embedding_permissions
GROQ_API_KEY=your_groq_api_key
```

### Database Setup

The project uses Supabase with the `pgvector` extension. The following SQL commands are needed to set up the database schema:

1.  **Enable pgvector extension:**
    ```sql
    create extension if not exists vector with schema extensions;
    ```

2.  **Create `documents` table:**
    ```sql
    create table if not exists documents (
        id bigserial primary key,
        name text,
        created_at timestamp with time zone default timezone('utc'::text, now()) not null
    );
    ```

3.  **Create `document_chunks` table:**
    ```sql
    create table if not exists document_chunks (
        id bigserial primary key,
        document_id bigint references documents(id) on delete cascade,
        content text,
        embedding vector(1536), -- Matches OpenAI text-embedding-ada-002
        created_at timestamp with time zone default timezone('utc'::text, now()) not null
    );
    ```

4.  **Create vector search function:**
    ```sql
    create or replace function match_document_chunks (
        query_embedding vector(1536),
        match_threshold float,
        match_count int
    )
    returns table (
        id bigint,
        document_id bigint,
        content text,
        similarity float
    )
    language plpgsql
    as $$
    begin
        return query
        select
            dc.id,
            dc.document_id,
            dc.content,
            1 - (dc.embedding <=> query_embedding) as similarity
        from document_chunks dc
        where 1 - (dc.embedding <=> query_embedding) > match_threshold
        order by similarity desc
        limit match_count;
    end;
    $$
    ```

### Available Scripts

-   `npm run dev`: Starts the development server.
-   `npm run build`: Builds the application for production.
-   `npm run start`: Starts the production server.
-   `npm run lint`: Lints the codebase.
-   `npm run postinstall`: Copies the PDF worker script.

## Customization

-   **LLM Provider:** Can be changed in `/api/chat/route.ts`.
-   **Embedding Model:** Modify the model in `/api/upload/route.ts` and update the vector dimensions in the database schema.
-   **UI:** Customize components in `/app/page.tsx` and `components/ui/`.
-   **Document Parsers:** Extend parsing logic in `/app/page.tsx` to support more file types.
-   **Chunking Strategy:** Adjust `RecursiveCharacterTextSplitter` parameters in `/api/upload/route.ts`.
-   **Vector Search:** Modify `match_threshold` and `match_count` in `/api/chat/route.ts`.
