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
const MAX_DOCUMENTS = 50; // Limit the number of documents to download to avoid overwhelming storage

// JFK Archive NARA page URL
const JFK_ARCHIVE_BASE_URL = 'https://www.archives.gov';
const JFK_ARCHIVE_PAGE_URL = 'https://www.archives.gov/research/jfk/release-2025';

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});
const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

// Validate environment variables
function validateEnvironment() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set in environment variables');
  }
  
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not set in environment variables');
  }
  
  if (!process.env.PINECONE_INDEX_NAME) {
    throw new Error('PINECONE_INDEX_NAME is not set in environment variables');
  }
  
  console.log(`Using Pinecone index: ${process.env.PINECONE_INDEX_NAME}`);
}

// Function to fetch a URL and return the response text
async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const httpClient = url.startsWith('https') ? https : http;
    
    httpClient.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return fetchUrl(response.headers.location)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}, status code: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Function to extract PDF links from the JFK Archive page
async function extractPdfLinks() {
  try {
    console.log(`Fetching JFK documents from ${JFK_ARCHIVE_PAGE_URL}...`);
    const pageHtml = await fetchUrl(JFK_ARCHIVE_PAGE_URL);
    
    // Extract PDF links using regex
    const pdfLinkRegex = /href="(\/files\/research\/jfk\/releases\/[^"]+\.pdf)"/g;
    const matches = pageHtml.matchAll(pdfLinkRegex);
    
    const pdfLinks = [];
    for (const match of matches) {
      if (match && match[1]) {
        const fullUrl = `${JFK_ARCHIVE_BASE_URL}${match[1]}`;
        const fileName = path.basename(match[1]);
        pdfLinks.push({ url: fullUrl, name: fileName });
      }
      
      // Limit the number of documents
      if (pdfLinks.length >= MAX_DOCUMENTS) {
        console.log(`Limiting to ${MAX_DOCUMENTS} documents to avoid overwhelming the system`);
        break;
      }
    }
    
    console.log(`Found ${pdfLinks.length} PDF documents on the JFK Archive page`);
    return pdfLinks;
  } catch (error) {
    console.error('Error extracting PDF links:', error.message);
    return [];
  }
}

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

// Function to download JFK Archive documents
async function downloadJfkArchiveDocuments() {
  console.log('Downloading JFK Archive documents...');
  
  // Create documents directory if it doesn't exist
  if (!fs.existsSync(DOCUMENTS_PATH)) {
    fs.mkdirSync(DOCUMENTS_PATH, { recursive: true });
  }
  
  // Extract PDF links from the JFK Archive page
  const pdfLinks = await extractPdfLinks();
  if (pdfLinks.length === 0) {
    console.log('No PDF links found on the JFK Archive page. Using backup documents.');
    // Use backup document links if page scraping fails
    return downloadBackupDocuments();
  }
  
  // Download each document
  let downloadedFiles = 0;
  for (const doc of pdfLinks) {
    const outputPath = path.join(DOCUMENTS_PATH, doc.name);
    
    // Skip download if file already exists
    if (fs.existsSync(outputPath)) {
      console.log(`${doc.name} already exists, skipping download.`);
      downloadedFiles++;
      continue;
    }
    
    try {
      await downloadFile(doc.url, outputPath);
      downloadedFiles++;
    } catch (error) {
      console.error(`Error downloading ${doc.name}:`, error.message);
    }
    
    // Add a small delay between downloads
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Document downloads completed. Downloaded ${downloadedFiles} documents.`);
  return downloadedFiles > 0;
}

// Backup function to download known documents if the JFK Archive page fails
async function downloadBackupDocuments() {
  console.log('Using backup document sources...');
  
  const backupDocs = [
    {
      name: 'Warren_Commission_Report.pdf',
      url: 'https://www.govinfo.gov/content/pkg/GPO-WARRENCOMMISSIONREPORT/pdf/GPO-WARRENCOMMISSIONREPORT.pdf'
    },
    {
      name: 'HSCA_Report.pdf',
      url: 'https://www.govinfo.gov/content/pkg/GPO-HSCA-ASSASSINATIONS-REPORT/pdf/GPO-HSCA-ASSASSINATIONS-REPORT.pdf'
    }
  ];
  
  let downloadedFiles = 0;
  for (const doc of backupDocs) {
    const outputPath = path.join(DOCUMENTS_PATH, doc.name);
    
    if (fs.existsSync(outputPath)) {
      console.log(`${doc.name} already exists, skipping download.`);
      downloadedFiles++;
      continue;
    }
    
    try {
      await downloadFile(doc.url, outputPath);
      downloadedFiles++;
    } catch (error) {
      console.error(`Error downloading ${doc.name}:`, error.message);
    }
  }
  
  console.log(`Backup document downloads completed. Downloaded ${downloadedFiles} documents.`);
  return downloadedFiles > 0;
}

// Function to get embedding from OpenRouter
async function getEmbedding(text) {
  try {
    if (!text || text.trim().length < 10) {
      console.warn('Text too short for embedding, skipping:', text);
      throw new Error('Text is too short for embedding');
    }
    
    console.log(`Getting embedding for text (${text.length} chars)`);
    
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://jfk-rag-vercel.vercel.app',
        'X-Title': 'JFK RAG System'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8192), // Limit to 8k tokens max
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !data.data[0]) {
      console.error('Unexpected response from OpenRouter:', JSON.stringify(data));
      throw new Error('Failed to generate embedding: unexpected response format');
    }
    
    console.log('Successfully generated embedding');
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error getting embedding:', error.message);
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
    let failedChunks = 0;
    
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunk = chunks[i];
        if (!chunk || chunk.length < 10) {
          console.log(`Skipping chunk ${i}: Text too short`);
          continue;
        }
        
        const embedding = await getEmbedding(chunk);
        
        if (!embedding || !Array.isArray(embedding)) {
          console.warn(`Invalid embedding for chunk ${i}, skipping`);
          failedChunks++;
          continue;
        }
        
        // Create a unique ID for this chunk
        const id = `${fileName.replace(/\.[^/.]+$/, '')}_chunk_${i}`;
        
        // Upsert the vector to Pinecone
        const upsertResponse = await index.upsert([{
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
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        failedChunks++;
        console.error(`Error processing chunk ${i} from ${fileName}:`, error.message);
        // Continue with next chunk despite error
        await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay after error
      }
    }
    
    console.log(`Successfully processed ${processedChunks}/${chunks.length} chunks from ${fileName} (${failedChunks} failed)`);
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
    // Validate environment variables first
    validateEnvironment();
    
    // First, download JFK Archive documents from the official NARA page
    const documentsDownloaded = await downloadJfkArchiveDocuments();
    
    if (!documentsDownloaded) {
      console.error('Failed to download any documents. Please check your internet connection or try again later.');
      return;
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
    console.log(`These documents are now searchable in your Pinecone index: ${process.env.PINECONE_INDEX_NAME}`);
  } catch (error) {
    console.error('Error during document ingestion:', error);
  }
}

// Run the ingestion process
ingestDocuments().catch(console.error); 