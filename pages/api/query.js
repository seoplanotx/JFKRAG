import { Pinecone } from '@pinecone-database/pinecone';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Initialize OpenRouter config
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      return res.status(500).json({ error: 'OpenRouter API key is not configured' });
    }

    // Get embedding for query using OpenRouter
    const embeddingResponse = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': 'https://jfk-rag-system.com',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
      }),
    });
    
    const embeddingData = await embeddingResponse.json();
    
    if (!embeddingData.data || !embeddingData.data[0]) {
      throw new Error('Failed to generate embedding');
    }
    
    const embedding = embeddingData.data[0].embedding;
    
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
    
    // Generate answer with OpenRouter
    const completion = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': 'https://jfk-rag-system.com',
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'anthropic/claude-3-opus:beta',
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
      }),
    });
    
    const completionData = await completion.json();
    
    if (!completionData.choices || !completionData.choices[0]) {
      throw new Error('Failed to generate answer');
    }
    
    const answer = completionData.choices[0].message.content;
    
    res.status(200).json({ answer, sources });
  } catch (error) {
    console.error('Error processing query:', error);
    res.status(500).json({ error: 'An error occurred while processing your query' });
  }
} 