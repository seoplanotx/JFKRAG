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

    // Environment variable validation
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX_NAME;
    const llmModel = process.env.LLM_MODEL || 'anthropic/claude-3-sonnet';
    const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';

    if (!openRouterApiKey) {
      console.error('Missing environment variable: OPENROUTER_API_KEY');
      return res.status(500).json({ error: 'OPENROUTER_API_KEY environment variable is required' });
    }
    
    if (!openAiApiKey) {
      console.error('Missing environment variable: OPENAI_API_KEY');
      return res.status(500).json({ error: 'OPENAI_API_KEY environment variable is required' });
    }
    
    if (!pineconeApiKey || !pineconeIndexName) {
      console.error('Missing Pinecone configuration:', { hasPineconeApiKey: !!pineconeApiKey, hasPineconeIndexName: !!pineconeIndexName });
      return res.status(500).json({ error: 'Pinecone configuration is incomplete. Check PINECONE_API_KEY and PINECONE_INDEX_NAME environment variables.' });
    }

    console.log('Generating embedding for query:', query);
    console.log('Using embedding model:', embeddingModel);
    
    // Get embedding for query using OpenAI
    let embedding;
    try {
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model: embeddingModel,
          input: query,
        }),
      });

      if (!embeddingResponse.ok) {
        const error = await embeddingResponse.text();
        console.error('Error from OpenAI embeddings API:', error);
        return res.status(500).json({ error: 'Failed to generate embeddings from OpenAI API' });
      }

      const embeddingData = await embeddingResponse.json();
      if (!embeddingData.data || !embeddingData.data[0] || !embeddingData.data[0].embedding) {
        console.error('Unexpected response format from OpenAI embeddings API:', JSON.stringify(embeddingData));
        return res.status(500).json({ error: 'Invalid response format from OpenAI embeddings API' });
      }
      
      embedding = embeddingData.data[0].embedding;
      console.log('Successfully generated embedding with dimension:', embedding.length);
    } catch (error) {
      console.error('Error generating embedding:', error);
      return res.status(500).json({ error: `Embedding generation error: ${error.message}` });
    }
    
    // Query Pinecone
    let matches;
    try {
      console.log('Initializing Pinecone client');
      const pinecone = new Pinecone({
        apiKey: pineconeApiKey,
      });
      
      console.log(`Connecting to Pinecone index: ${pineconeIndexName}`);
      const index = pinecone.index(pineconeIndexName);
      
      console.log(`Querying Pinecone with vector of dimension: ${embedding.length}`);
      
      // Search for similar vectors
      const queryResponse = await index.query({
        vector: embedding,
        topK: 5,
        includeMetadata: true
      });
      
      console.log(`Pinecone query returned ${queryResponse.matches?.length || 0} matches`);
    
      // Process results and create context
      matches = queryResponse.matches || [];
      
      if (matches.length === 0) {
        console.log('No matches found in Pinecone');
        return res.status(200).json({ 
          answer: "I don't have enough information to answer this question based on the JFK Archives.",
          sources: []
        });
      }
    } catch (error) {
      console.error('Error querying Pinecone:', error);
      return res.status(500).json({ error: `Pinecone query error: ${error.message}` });
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
    try {
      console.log('Sending request to OpenRouter API with model:', llmModel);
      const completion = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': 'https://jfk-rag.vercel.app',
          'X-Title': 'JFK RAG Application',
        },
        body: JSON.stringify({
          model: llmModel,
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
      
      if (!completion.ok) {
        const errorData = await completion.text();
        console.error('OpenRouter API error:', errorData);
        return res.status(500).json({ error: 'Failed to generate response from OpenRouter API' });
      }
      
      const completionData = await completion.json();
      
      if (!completionData.choices || !completionData.choices[0]) {
        console.error('Unexpected OpenRouter response format:', JSON.stringify(completionData));
        throw new Error('Failed to generate answer: Invalid response format');
      }
      
      const answer = completionData.choices[0].message.content;
      console.log('Successfully generated answer');
      
      res.status(200).json({ answer, sources });
    } catch (error) {
      console.error('Error generating answer with OpenRouter:', error);
      return res.status(500).json({ error: `Answer generation error: ${error.message}` });
    }
  } catch (error) {
    console.error('Unexpected error processing query:', error);
    res.status(500).json({ error: 'An unexpected error occurred while processing your query' });
  }
} 