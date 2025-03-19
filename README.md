# JFK RAG Vercel Deployment

This is a simplified version of the JFK RAG system for Vercel deployment. It provides a web interface to query the JFK Archive documents using Retrieval-Augmented Generation (RAG).

## Features

- Next.js web application with React
- Serverless API routes for vector search
- Integration with Pinecone for vector storage
- OpenRouter API for embeddings and LLM generation
- Tailwind CSS for styling

## Development

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Environment Variables

You'll need to set up the following environment variables in your Vercel deployment:

```
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=jfk-documents
OPENROUTER_API_KEY=your_openrouter_api_key
LLM_MODEL=anthropic/claude-3-opus:beta
```

You can customize the LLM_MODEL to any model supported by OpenRouter.

## Deployment

This project is designed to be deployed to Vercel:

1. Push the code to GitHub
2. Create a new project in Vercel
3. Connect to your GitHub repository
4. Set the environment variables
5. Deploy

## Architecture

- `/pages/api/query.js`: Serverless API route for handling queries
- `/pages/index.js`: Main user interface
- Pinecone for vector search
- OpenRouter for embeddings and generation

This is a simplified frontend that connects directly to Pinecone. The document ingestion and processing is handled separately by the main JFK RAG system backend. 