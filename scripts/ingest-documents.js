require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');
const pdfParse = require('pdf-parse');
const https = require('https');
const http = require('http');

// Configuration
const DOCUMENTS_PATH = path.join(process.cwd(), 'documents');
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// JFK Archive URLs - key documents related to the assassination
const JFK_ARCHIVE_DOCS = [
  {
    name: 'Warren_Commission_Report.pdf',
    url: 'https://www.archives.gov/files/research/jfk/warren-commission-report/report.pdf'
  },
  {
    name: 'HSCA_Report.pdf',
    url: 'https://www.archives.gov/files/research/jfk/hsca/report/hsca-report.pdf'
  },
  {
    name: 'Church_Committee_Report.pdf',
    url: 'https://www.archives.gov/files/research/jfk/releases/docid-32423624.pdf'
  }
];

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});
const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

// Function to download a file from a URL
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} to ${outputPath}...`);
    
    // Select http or https module based on URL
    const httpClient = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(outputPath);
    
    httpClient.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`Following redirect to: ${response.headers.location}`);
        return downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }
      
      // Check for successful response
      if (response.statusCode !== 200) {
        fs.unlink(outputPath, () => {}); // Delete the file on error
        reject(new Error(`Failed to download, status code: ${response.statusCode}`));
        return;
      }
      
      // Pipe the response to the file
      response.pipe(file);
      
      // Handle errors during download
      file.on('error', (err) => {
        fs.unlink(outputPath, () => {}); // Delete the file on error
        reject(err);
      });
      
      // Close the file when done
      file.on('finish', () => {
        file.close();
        console.log(`Successfully downloaded ${url}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

// Function to download all JFK Archive documents
async function downloadJfkArchiveDocuments() {
  console.log('Downloading JFK Archive documents...');
  
  // Create documents directory if it doesn't exist
  if (!fs.existsSync(DOCUMENTS_PATH)) {
    fs.mkdirSync(DOCUMENTS_PATH, { recursive: true });
  }
  
  // Download each document
  for (const doc of JFK_ARCHIVE_DOCS) {
    const outputPath = path.join(DOCUMENTS_PATH, doc.name);
    
    // Skip download if file already exists
    if (fs.existsSync(outputPath)) {
      console.log(`${doc.name} already exists, skipping download.`);
      continue;
    }
    
    try {
      await downloadFile(doc.url, outputPath);
    } catch (error) {
      console.error(`Error downloading ${doc.name}:`, error.message);
    }
  }
  
  console.log('Document downloads completed.');
}

// Function to get embedding from OpenRouter
async function getEmbedding(text) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://jfk-rag-system.com',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });
    
    const data = await response.json();
    
    if (!data.data || !data.data[0]) {
      throw new Error('Failed to generate embedding');
    }
    
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}

// Function to split text into chunks
function splitTextIntoChunks(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  
  if (text.length <= chunkSize) {
    chunks.push(text);
    return chunks;
  }
  
  let startIndex = 0;
  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    
    // If this is not the last chunk, try to break at a period or space
    if (endIndex < text.length) {
      const period = text.lastIndexOf('.', endIndex);
      const space = text.lastIndexOf(' ', endIndex);
      
      // If we found a period within 100 characters of our desired end, use it
      if (period > startIndex && period > endIndex - 100) {
        endIndex = period + 1;
      } 
      // Otherwise if we found a space within 20 characters, use it
      else if (space > startIndex && space > endIndex - 20) {
        endIndex = space + 1;
      }
    } else {
      // If this is the last chunk, just use the end of the text
      endIndex = text.length;
    }
    
    // Add the chunk to our array
    chunks.push(text.slice(startIndex, endIndex).trim());
    
    // Move the start index forward, accounting for overlap
    startIndex = endIndex - overlap;
    
    // If the remaining text is shorter than the overlap, we're done
    if (startIndex >= text.length - overlap) {
      break;
    }
  }
  
  return chunks;
}

// Function to process a PDF file
async function processPdfFile(filePath) {
  try {
    console.log(`Processing PDF: ${filePath}`);
    
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer);
    
    const fileName = path.basename(filePath);
    const chunks = splitTextIntoChunks(pdfData.text);
    
    console.log(`Extracted ${chunks.length} chunks from ${fileName}`);
    
    let processedChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);
      
      // Create a unique ID for this chunk
      const id = `${fileName.replace(/\.[^/.]+$/, '')}_chunk_${i}`;
      
      // Upsert the vector to Pinecone
      await index.upsert([{
        id: id,
        values: embedding,
        metadata: {
          text: chunk,
          source: fileName,
          page: Math.floor(i / 2) + 1, // Rough estimate of page numbers
          chunk: i,
        }
      }]);
      
      processedChunks++;
      console.log(`Processed chunk ${processedChunks}/${chunks.length} from ${fileName}`);
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`Successfully processed ${fileName}`);
    return processedChunks;
  } catch (error) {
    console.error(`Error processing PDF ${filePath}:`, error);
    return 0;
  }
}

// Main function to ingest documents
async function ingestDocuments() {
  console.log('Starting document ingestion process...');
  
  try {
    // First, download JFK Archive documents if needed
    await downloadJfkArchiveDocuments();
    
    // Check if documents directory exists (should be created by download step)
    if (!fs.existsSync(DOCUMENTS_PATH)) {
      console.log('Documents directory not found. Creating it...');
      fs.mkdirSync(DOCUMENTS_PATH, { recursive: true });
    }
    
    // Get all PDF files in the documents directory
    const files = fs.readdirSync(DOCUMENTS_PATH)
      .filter(file => file.toLowerCase().endsWith('.pdf'))
      .map(file => path.join(DOCUMENTS_PATH, file));
    
    if (files.length === 0) {
      console.log('No PDF files found in the documents directory.');
      return;
    }
    
    console.log(`Found ${files.length} PDF files to process.`);
    
    let totalProcessedChunks = 0;
    
    // Process each PDF file
    for (const file of files) {
      const processedChunks = await processPdfFile(file);
      totalProcessedChunks += processedChunks;
    }
    
    console.log(`Document ingestion completed. Processed ${totalProcessedChunks} chunks from ${files.length} files.`);
  } catch (error) {
    console.error('Error during document ingestion:', error);
  }
}

// Run the ingestion process
ingestDocuments().catch(console.error); 