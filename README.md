# JFK RAG Vercel Deployment

This is a simplified version of the JFK RAG system for Vercel deployment. It provides a web interface to query the JFK Archive documents using Retrieval-Augmented Generation (RAG).

## Features

- Next.js web application with React
- Serverless API routes for vector search
- Integration with Pinecone for vector storage
- OpenRouter API for embeddings and LLM generation
- Tailwind CSS for styling
- Automatic document fetching from National Archives JFK Records Collection
- OCR processing for scanned documents
- PDF document ingestion script
- Easy setup script for environment variables

## Quick Start

1. Clone this repository
2. Install dependencies: `npm install`
3. Run the setup script to configure environment variables: `npm run setup`
4. Run the document ingestion script: `npm run ingest`
5. Start the development server: `npm run dev`
6. Deploy to Vercel: `vercel --prod`

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

## Environment Setup

The project includes a setup script to help you configure environment variables both locally and on Vercel:

```bash
npm run setup
```

This script will:
1. Check if Vercel CLI is installed
2. Guide you through entering your API keys
3. Create a local `.env` file
4. Optionally set up the environment variables in your Vercel project

Required environment variables:
- `OPENROUTER_API_KEY` - For embeddings and LLM generation
- `PINECONE_API_KEY` - For vector database access
- `PINECONE_INDEX_NAME` - Typically "jfkfiles"
- `LLM_MODEL` - OpenRouter model to use (default: "anthropic/claude-3-opus:beta")

## Document Ingestion

Before the RAG system will work, you need to ingest documents into the Pinecone database:

```bash
npm run ingest
```

The script will:
- Automatically scrape and download JFK documents from the National Archives' official [JFK Collection 2025 release page](https://www.archives.gov/research/jfk/release-2025)
- Process each PDF document, using OCR for scanned documents
- Split text into chunks
- Generate embeddings using OpenRouter
- Store vectors in your Pinecone database

### OCR Processing

The system includes Optical Character Recognition (OCR) capabilities:

- Automatically detects when documents are scanned images rather than text
- Uses Tesseract.js to extract text from document images
- Enables searching through historically significant documents that are only available as scans
- Works with both modern PDFs and scanned historical archives

You can also add your own PDF files to the `documents` directory, and they will be processed along with the automatically downloaded ones.

After ingestion completes, your RAG system will be able to search and retrieve information from the documents.

## End-to-End Testing

This project uses Playwright for end-to-end testing. The tests verify that the application UI works correctly and handles API interactions properly.

To run the tests locally:

```bash
# Install Playwright browsers
npx playwright install

# Run the tests
npm run test:e2e

# Run tests with browser UI visible
npm run test:e2e:headed
```

The tests run automatically on:
- Push to main branch
- Pull requests
- Manual trigger via GitHub Actions

The tests use the live Vercel deployment to ensure everything works in production.

## Deployment

This project is designed to be deployed to Vercel:

1. Push the code to GitHub
2. Create a new project in Vercel
3. Connect to your GitHub repository
4. Set up environment variables (use `npm run setup` to help with this)
5. Deploy with `vercel --prod`

## Architecture

- `/pages/api/query.js`: Serverless API route for handling queries
- `/pages/index.js`: Main user interface
- `/scripts/ingest-documents.js`: Document ingestion script with OCR and automatic NARA page scraping
- `/scripts/setup-vercel-env.js`: Setup script for environment variables
- Pinecone for vector search
- OpenRouter for embeddings and generation
- Tesseract.js for OCR processing

This is a simplified frontend that connects directly to Pinecone. The document ingestion process automatically downloads JFK documents from the National Archives, performs OCR when needed, and prepares them for the vector database. 
