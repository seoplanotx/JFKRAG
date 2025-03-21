# Document Ingestion

This directory is used to store JFK-related PDF documents that will be processed and added to the Pinecone vector database.

## Automatic Document Fetching

The ingestion script will automatically scrape and download JFK documents from the National Archives' official website:

- **Source**: [JFK Collection 2025 Release](https://www.archives.gov/research/jfk/release-2025)
- **Content**: Recently declassified documents from the JFK Assassination Records Collection
- **Format**: PDF files containing scanned documents, memos, and reports

The script will download up to 50 documents from this page to avoid overwhelming your storage.

## Backup Documents

If the National Archives page is unavailable, the script will fall back to these key documents:

1. Warren Commission Report
2. House Select Committee on Assassinations (HSCA) Report

## Adding Custom Documents

You can also add your own JFK-related PDF documents to this directory. They will be processed along with the automatically downloaded documents.

## Instructions

1. (Optional) Place additional PDF files in this directory
2. Run the ingestion script: `npm run ingest`
3. The script will scrape the NARA website, download documents, process each PDF file, split it into chunks, generate embeddings, and store them in your Pinecone database

## Best Practices

- Use high-quality, text-based PDFs for best results
- Name your PDF files descriptively (e.g., `jfk_assassination_report.pdf`)
- Files should be less than 50MB for optimal processing
- Processing large documents may take time due to API rate limits 