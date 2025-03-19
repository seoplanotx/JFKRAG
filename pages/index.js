import { useState } from 'react';
import Head from 'next/head';

export default function Home() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!query.trim()) return;
    
    setLoading(true);
    setError('');
    setAnswer('');
    setSources([]);
    
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to get answer');
      }
      
      const data = await response.json();
      setAnswer(data.answer);
      setSources(data.sources || []);
    } catch (err) {
      console.error('Error querying API:', err);
      setError('An error occurred while processing your query. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>JFK Archives RAG</title>
        <meta name="description" content="Search the JFK Archives using AI" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">JFK Archives Search</h1>
        
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a question about the JFK Archives..."
                className="flex-grow p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-3 rounded-md shadow hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
          
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
              <p>{error}</p>
            </div>
          )}
          
          {answer && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Answer</h2>
              <div className="prose max-w-none">
                <p>{answer}</p>
              </div>
            </div>
          )}
          
          {sources.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Sources</h2>
              <ul className="divide-y">
                {sources.map((source, index) => (
                  <li key={source.id} className="py-3">
                    <div className="flex items-start">
                      <span className="bg-gray-200 text-gray-700 h-6 w-6 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{source.document}</p>
                        {source.url && (
                          <a 
                            href={source.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            View Original Document
                          </a>
                        )}
                        <p className="text-sm text-gray-500 mt-1">Relevance Score: {(source.score * 100).toFixed(2)}%</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
      
      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-gray-500">
          <p>JFK Archives RAG System - Powered by Vercel, Pinecone, and OpenRouter</p>
        </div>
      </footer>
    </div>
  );
} 