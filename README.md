# Generic RAG Document Chat Template

This repository serves as a template for building applications that allow users to upload documents (TXT, PDF) and chat with them using Retrieval-Augmented Generation (RAG).

It provides a basic but functional structure integrating a frontend, backend API, vector database, embedding model, and a chat LLM.

## Features & Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **UI:** [React](https://react.dev/) with [Shadcn UI](https://ui.shadcn.com/)
- **Vector Database:** [Supabase](https://supabase.com/) (PostgreSQL with pgvector extension)
- **Embedding Model:** [OpenAI](https://openai.com/) (`text-embedding-ada-002`)
- **Chat LLM:** [Groq](https://groq.com/) (`llama3-8b-8192`)
- **Core Logic:**
  - Client-side PDF/TXT parsing (`pdfjs-dist`).
  - Text chunking (`langchain`).
  - Embedding generation via OpenAI API.
  - Vector similarity search via Supabase function.
  - Context injection into LLM prompt.
  - Streaming chat responses (Vercel AI SDK `useChat`).
- **Deployment:** Ready for deployment on platforms like [Vercel](https://vercel.com/).

## Using This Template

1.  Click the green "**Use this template**" button on the main page of this repository.
2.  Choose "**Create a new repository**".
3.  Select an owner (you or an organization) and give your **new project** a unique name.
4.  Choose visibility (Public/Private).
5.  Click "**Create repository from template**".

This creates a **new, independent repository** based on this template's code.

## Setting Up Your New Project

After creating your new repository from the template:

1.  **Clone Your New Repository:**

    ```bash
    git clone <your-new-repository-url>
    cd <your-new-repository-name>
    ```

2.  **Install Dependencies:**

    ```bash
    npm install
    # or yarn install / pnpm install
    ```

3.  **Set Up Supabase:**

    - Create a new Supabase project or use an existing one.
    - In the Supabase SQL Editor, run the following commands to set up the necessary schema:
      - Enable pgvector extension:
        ```sql
        create extension if not exists vector with schema extensions;
        ```
      - Create the `documents` table:
        ```sql
        create table if not exists documents (
            id bigserial primary key,
            name text,
            created_at timestamp with time zone default timezone('utc'::text, now()) not null
            -- TODO: Add user_id UUID REFERENCES auth.users(id) if implementing multi-user
        );
        -- TODO: Add RLS policies if implementing multi-user
        ```
      - Create the `document_chunks` table:
        ```sql
        create table if not exists document_chunks (
            id bigserial primary key,
            document_id bigint references documents(id) on delete cascade,
            content text,
            embedding vector(1536), -- Matches OpenAI text-embedding-ada-002
            created_at timestamp with time zone default timezone('utc'::text, now()) not null
            -- TODO: Add user_id UUID if implementing multi-user
        );
        -- TODO: Add RLS policies if implementing multi-user
        ```
      - Create the vector search function:
        ```sql
        create or replace function match_document_chunks (
            query_embedding vector(1536),
            match_threshold float,
            match_count int
            -- TODO: Add input_user_id UUID if implementing multi-user
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
            -- TODO: Add WHERE dc.user_id = input_user_id if implementing multi-user
            where 1 - (dc.embedding <=> query_embedding) > match_threshold
            order by similarity desc
            limit match_count;
        end;
        $$
        ```

4.  **Create `.env.local` File:**

    - Create a file named `.env.local` in the root of your project.
    - Add the following environment variables, replacing the placeholders with your actual keys/URLs:
      ```dotenv
      NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
      NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
      OPENAI_API_KEY=your_openai_api_key_with_embedding_permissions
      GROQ_API_KEY=your_groq_api_key
      ```
    - Ensure your OpenAI API key is linked to a project with **active billing** and permission to use the `text-embedding-ada-002` model.

5.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## Basic Usage

1.  Upload a `.txt` or `.pdf` file using the sidebar.
2.  Wait for the processing and upload confirmation message.
3.  Ask questions about the content of the uploaded document in the chat interface.

## Customization Points

- **LLM Provider:** Modify `/api/chat/route.ts` to use a different LLM provider (e.g., OpenAI, Anthropic) via the Vercel AI SDK.
- **Embedding Model:** Change the model used in `/api/upload/route.ts` and update the `vector(dimension)` size in the `document_chunks` table and `match_document_chunks` function accordingly.
- **UI:** Customize components in `/app/page.tsx` and `components/ui/`.
- **Document Parsers:** Extend client-side parsing in `/app/page.tsx` to support more file types (e.g., `.docx`).
- **Multi-User Support:** Implement authentication (e.g., Supabase Auth), add `user_id` columns to tables, set up Row Level Security (RLS) policies, and update API routes to filter by user (see TODO comments in SQL above).
- **Chunking Strategy:** Adjust parameters in `RecursiveCharacterTextSplitter` in `/api/upload/route.ts`.
- **Vector Search Parameters:** Modify `match_threshold` and `match_count` in `/api/chat/route.ts`.
