require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

// Configuration
const DOCUMENTS_PATH = path.join(process.cwd(), 'documents');
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_DOCUMENTS = 5; // Limit for testing

// Ensure documents directory exists
if (!fs.existsSync(DOCUMENTS_PATH)) {
  fs.mkdirSync(DOCUMENTS_PATH, { recursive: true });
}

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

// Environment variable validation
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Function to validate environment variables
async function validateEnvironment() {
  // For simplicity, let's just use the index directly without checking or creating
  console.log('Using Pinecone index:', process.env.PINECONE_INDEX_NAME);
  return true;
}

// Function to download a file
async function downloadFile(url, filePath) {
  console.log(`Downloading ${url} to ${filePath}...`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const fileStream = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', resolve);
    });
    console.log(`Successfully downloaded ${url}`);
    return true;
  } catch (error) {
    console.error(`Error downloading ${url}: ${error.message}`);
    return false;
  }
}

// Function to download JFK Archive documents
async function downloadJFKDocuments() {
  console.log('Downloading JFK Archive documents...');
  
  try {
    // Fetch the JFK releases page
    const archiveUrl = 'https://www.archives.gov/research/jfk/release-2025';
    console.log(`Fetching JFK documents from ${archiveUrl}...`);
    
    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch JFK archive page: ${response.statusText}`);
    }
    
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Find all PDF links on the page
    const pdfLinks = Array.from(document.querySelectorAll('a[href$=".pdf"]'))
      .map(a => a.href)
      .filter(href => href.includes('jfk/releases'));
    
    if (pdfLinks.length === 0) {
      console.log('No PDF links found on the JFK Archive page');
      return [];
    }
    
    console.log(`Limiting to ${MAX_DOCUMENTS} documents to avoid overwhelming the system`);
    const limitedLinks = pdfLinks.slice(0, MAX_DOCUMENTS);
    console.log(`Found ${limitedLinks.length} PDF documents on the JFK Archive page`);
    
    // Download each document
    const downloadedFiles = [];
    for (const link of limitedLinks) {
      const fullUrl = link.startsWith('http') ? link : `https://www.archives.gov${link}`;
      const fileName = path.basename(fullUrl);
      const filePath = path.join(DOCUMENTS_PATH, fileName);
      
      // Skip if file already exists
      if (fs.existsSync(filePath)) {
        console.log(`${fileName} already exists, skipping download.`);
        downloadedFiles.push(filePath);
        continue;
      }
      
      const success = await downloadFile(fullUrl, filePath);
      if (success) {
        downloadedFiles.push(filePath);
      }
      
      // Add a small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`Document downloads completed. Downloaded ${downloadedFiles.length} documents.`);
    return downloadedFiles;
  } catch (error) {
    console.error(`Error downloading JFK Archive documents: ${error.message}`);
    return [];
  }
}

// Function to extract text from PDF
async function extractTextFromPDF(filePath) {
  const fileName = path.basename(filePath);
  console.log(`Extracting text from ${fileName}...`);
  
  try {
    // Try regular PDF text extraction
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    let extractedText = pdfData.text || '';
    
    // Even if very little text was extracted, add metadata and use it
    if (extractedText.trim().length < 100) {
      console.log(`Limited text extracted (${extractedText.length} chars) from ${fileName}`);
      
      // Add document metadata as part of the text to ensure we have something to index
      const metadata = `
Document: ${fileName}
Source: JFK Archive
Number of Pages: ${pdfData.numpages}
Info: This appears to be a scanned document with limited machine-readable text.
Document Info: ${JSON.stringify(pdfData.info || {})}
      `;
      
      extractedText = metadata + "\n\n" + extractedText;
      console.log(`Added metadata to text, new length: ${extractedText.length} chars`);
    } else {
      console.log(`Successfully extracted ${extractedText.length} characters from ${fileName}`);
    }
    
    return extractedText;
  } catch (error) {
    console.error(`Error extracting text from ${fileName}: ${error.message}`);
    
    // Return some basic metadata as text to ensure we have something to index
    return `
Document: ${fileName}
Source: JFK Archive
Error: Could not extract text from this document. 
Note: This document may be a scanned image requiring OCR processing.
    `;
  }
}

// Function to split text into chunks
function splitIntoChunks(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  if (!text || text.length === 0) return chunks;
  
  if (text.length <= size) {
    chunks.push(text);
    return chunks;
  }
  
  let startIndex = 0;
  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + size, text.length);
    
    // Try to break at sentence or paragraph boundary if possible
    if (endIndex < text.length) {
      const period = text.lastIndexOf('.', endIndex);
      const newline = text.lastIndexOf('\n', endIndex);
      
      // If we found a good break point within reasonable distance, use it
      if (period > startIndex && period > endIndex - 100) {
        endIndex = period + 1;
      } else if (newline > startIndex && newline > endIndex - 50) {
        endIndex = newline + 1;
      }
    }
    
    chunks.push(text.slice(startIndex, endIndex).trim());
    startIndex = endIndex - overlap;
    
    if (startIndex >= text.length) break;
  }
  
  return chunks;
}

// Function to create embeddings using OpenAI
async function createEmbedding(text) {
  console.log(`Creating embedding for text of length ${text.length} characters...`);
  
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });
    
    console.log(`OpenAI API response status: ${response.status}`);
    console.log(`OpenAI API response headers: ${JSON.stringify(Array.from(response.headers.entries()))}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Error creating embeddings: OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
      throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      console.error(`Unexpected OpenAI API response format: ${JSON.stringify(data)}`);
      throw new Error(`Unexpected OpenAI API response format: ${JSON.stringify(data)}`);
    }
    
    return data.data[0].embedding;
  } catch (error) {
    console.error(`Error creating embeddings: ${error.message}`);
    throw error;
  }
}

// Function to process documents and add to Pinecone
async function processDocuments(indexName) {
  const pdfFiles = await getPDFFiles();
  
  if (pdfFiles.length === 0) {
    console.log('No PDF files found to process');
    return;
  }
  
  console.log(`Found ${pdfFiles.length} PDF files to process.\n`);
  
  const pineconeIndex = pinecone.index(indexName);
  
  let totalSuccessfulChunks = 0;
  let totalProcessedFiles = 0;
  
  // Process each file individually
  for (const filePath of pdfFiles) {
    const fileName = path.basename(filePath);
    console.log(`\nProcessing file: ${fileName}`);
    
    try {
      // Extract text from PDF
      const extractedText = await extractTextFromPDF(filePath);
      
      if (!extractedText || extractedText.trim().length < 10) {
        console.warn(`Insufficient text extracted from ${fileName}, skipping...`);
        continue;
      }
      
      // Split text into manageable chunks
      const chunks = splitIntoChunks(extractedText);
      console.log(`Split document into ${chunks.length} chunks`);
      
      // Process each chunk
      let processedChunks = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Skip tiny chunks
        if (chunk.trim().length < 10) continue;
        
        try {
          console.log(`Creating embedding for chunk ${i+1}/${chunks.length} of ${fileName}...`);
          const embedding = await createEmbedding(chunk);
          
          // Create a unique ID
          const id = `${fileName.replace(/\.[^/.]+$/, '')}_chunk_${i}`;
          
          // Store in Pinecone
          await pineconeIndex.upsert([
            {
              id,
              values: embedding,
              metadata: {
                text: chunk,
                source: fileName,
                chunk: i
              }
            }
          ]);
          
          processedChunks++;
          console.log(`Successfully stored embedding ${id} in Pinecone`);
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Error processing chunk ${i+1} of ${fileName}: ${error.message}`);
          // Continue with next chunk
        }
      }
      
      totalSuccessfulChunks += processedChunks;
      console.log(`Completed processing ${fileName}: ${processedChunks}/${chunks.length} chunks successfully stored`);
    } catch (error) {
      console.error(`Error processing file ${fileName}: ${error.message}`);
      // Continue with next file
    }
  }
  
  console.log(`\nDocument ingestion completed. Successfully processed ${totalSuccessfulChunks} chunks from ${pdfFiles.length} files.`);
  console.log(`These documents are now searchable in your Pinecone index: ${indexName}`);
}

// Main function to ingest documents
async function ingestDocuments() {
  console.log('Starting document ingestion process...');
  
  try {
    // Validate environment variables
    await validateEnvironment();
    
    // Download JFK Archive documents
    await downloadJFKDocuments();
    
    // Process documents and store in Pinecone
    await processDocuments(process.env.PINECONE_INDEX_NAME);
    
    console.log('\nIngest process completed successfully!');
  } catch (error) {
    console.error(`Error during document ingestion: ${error.message}`);
    process.exit(1);
  }
}

// Run the ingestion process
ingestDocuments().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Function to get PDF files
async function getPDFFiles() {
  try {
    const files = fs.readdirSync(DOCUMENTS_PATH)
      .filter(file => file.toLowerCase().endsWith('.pdf'))
      .map(file => path.join(DOCUMENTS_PATH, file));
    
    return files;
  } catch (error) {
    console.error(`Error getting PDF files: ${error.message}`);
    return [];
  }
} 