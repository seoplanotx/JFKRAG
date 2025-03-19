import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Initialize OpenAI client
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key is not configured' });
    }
    
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // Get embedding for query using OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
    });
    
    if (!embeddingResponse.data || !embeddingResponse.data[0]) {
      throw new Error('Failed to generate embedding');
    }
    
    const embedding = embeddingResponse.data[0].embedding;
    
    // Query Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    
    // Search for similar vectors
    const queryResponse = await index.query({
      vector: embedding,
      topK: 5,
      includeMetadata: true
    });
    
    // Process results and create context
    const matches = queryResponse.matches || [];
    
    if (matches.length === 0) {
      return res.status(200).json({ 
        answer: "I don't have enough information to answer this question based on the JFK Archives.",
        sources: []
      });
    }
    
    // Extract text and metadata from matches
    const contextChunks = matches.map(match => match.metadata.text);
    const context = contextChunks.join('\n\n');
    
    // Format sources
    const sources = matches.map(match => ({
      id: match.id,
      score: match.score,
      document: match.metadata.source || 'Unknown',
      url: match.metadata.url || '',
    }));
    
    // Generate answer with OpenAI
    const chatCompletion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that answers questions about JFK documents based on the following context. 
If the information is not in the context, say you don't know.
Always cite the document sources in your answer using numbers like [1], [2], etc.
When citing sources, reference the specific documents that contain the information.

Context:
${context}`
        },
        { role: "user", content: query }
      ]
    });
    
    if (!chatCompletion.choices || !chatCompletion.choices[0]) {
      throw new Error('Failed to generate answer');
    }
    
    const answer = chatCompletion.choices[0].message.content;
    
    res.status(200).json({ answer, sources });
  } catch (error) {
    console.error('Error processing query:', error);
    res.status(500).json({ error: 'An error occurred while processing your query' });
  }
} 