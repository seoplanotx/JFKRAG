#!/usr/bin/env node
require('dotenv').config();
const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if Vercel CLI is installed
let vercelInstalled = false;
try {
  execSync('vercel --version', { stdio: 'ignore' });
  vercelInstalled = true;
  console.log('✅ Vercel CLI detected');
} catch (error) {
  console.log('⚠️ Vercel CLI not detected. If you want to set up environment variables in Vercel, please install the Vercel CLI first.');
}

// Check if user is logged in to Vercel
let vercelLoggedIn = false;
if (vercelInstalled) {
  try {
    execSync('vercel whoami', { stdio: 'ignore' });
    vercelLoggedIn = true;
    console.log('✅ You are logged in to Vercel');
  } catch (error) {
    console.log('⚠️ You are not logged in to Vercel. If you want to set up environment variables in Vercel, please run `vercel login` first.');
  }
}

const promptUser = (question, defaultValue) => {
  return new Promise((resolve) => {
    rl.question(`${question}${defaultValue ? ` (default: ${defaultValue})` : ''}: `, (answer) => {
      resolve(answer || defaultValue || '');
    });
  });
};

const setupEnvironmentVariables = async () => {
  console.log('\n📝 Setting up environment variables for the JFK RAG application\n');
  
  // Prompt for API keys and other configuration
  const openRouterApiKey = await promptUser('Enter your OPENROUTER_API_KEY');
  const openAiApiKey = await promptUser('Enter your OPENAI_API_KEY (used for embeddings)');
  const pineconeApiKey = await promptUser('Enter your PINECONE_API_KEY');
  const pineconeIndexName = await promptUser('Enter your PINECONE_INDEX_NAME', 'jfkfiles');
  const llmModel = await promptUser('Enter your preferred LLM model', 'anthropic/claude-3-sonnet');
  
  // Create or update .env file
  const envContent = `OPENROUTER_API_KEY=${openRouterApiKey}
OPENAI_API_KEY=${openAiApiKey}
PINECONE_API_KEY=${pineconeApiKey}
PINECONE_INDEX_NAME=${pineconeIndexName}
LLM_MODEL=${llmModel}`;
  
  fs.writeFileSync('.env', envContent);
  console.log('✅ Created .env file with environment variables');
  
  // Ask if user wants to set up environment variables in Vercel
  if (vercelInstalled && vercelLoggedIn) {
    const setupInVercel = await promptUser('Do you want to set up these environment variables in Vercel? (y/n)', 'y');
    
    if (setupInVercel.toLowerCase() === 'y' || setupInVercel.toLowerCase() === 'yes') {
      console.log('\n🔄 Setting up environment variables in Vercel...');
      
      try {
        // Add environment variables to Vercel
        execSync(`vercel env add OPENROUTER_API_KEY production`, { stdio: 'inherit' });
        execSync(`vercel env add OPENAI_API_KEY production`, { stdio: 'inherit' });
        execSync(`vercel env add PINECONE_API_KEY production`, { stdio: 'inherit' });
        execSync(`vercel env add PINECONE_INDEX_NAME production`, { stdio: 'inherit' });
        execSync(`vercel env add LLM_MODEL production`, { stdio: 'inherit' });
        
        console.log('✅ Environment variables set up in Vercel');
      } catch (error) {
        console.error('❌ Failed to set up environment variables in Vercel:', error.message);
      }
    } else {
      console.log('\n⚠️ Skipping Vercel environment setup. You can manually configure these variables in the Vercel dashboard.');
    }
  }
  
  console.log('\n🎉 Setup complete! Next steps:');
  console.log('1. Run `npm run ingest` to download and process JFK Archive documents');
  console.log('2. Run `npm run dev` to start the development server');
  console.log('3. Deploy to Vercel with `vercel deploy`');
  
  rl.close();
};

setupEnvironmentVariables(); 