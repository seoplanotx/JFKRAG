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

// Function to check if Vercel CLI is installed
function checkVercelCLI() {
  try {
    execSync('vercel --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Function to prompt for environment variable
function promptForEnvVar(name, description, defaultValue = '') {
  return new Promise((resolve) => {
    let prompt = `Enter your ${name}`;
    if (description) {
      prompt += ` (${description})`;
    }
    if (defaultValue) {
      prompt += ` [${defaultValue}]`;
    }
    prompt += ': ';
    
    rl.question(prompt, (answer) => {
      resolve(answer || defaultValue);
    });
  });
}

// Main function
async function setup() {
  console.log('JFK RAG Vercel Environment Setup');
  console.log('================================\n');
  
  // Check for Vercel CLI
  if (!checkVercelCLI()) {
    console.log('❌ Vercel CLI not found. Please install it with:');
    console.log('npm install -g vercel');
    rl.close();
    return;
  }
  
  console.log('✅ Vercel CLI detected\n');
  
  // Check for project login
  try {
    execSync('vercel project ls', { stdio: 'ignore' });
    console.log('✅ Logged in to Vercel\n');
  } catch (error) {
    console.log('You need to log in to Vercel first:');
    try {
      execSync('vercel login', { stdio: 'inherit' });
    } catch (error) {
      console.error('❌ Failed to log in to Vercel');
      rl.close();
      return;
    }
  }
  
  // Get existing .env values if available
  let existingEnv = {};
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        existingEnv[match[1]] = match[2];
      }
    });
  }
  
  // Collect environment variables
  console.log('Please enter your environment variables:\n');
  
  const openaiApiKey = await promptForEnvVar(
    'OPENAI_API_KEY', 
    'from OpenAI (platform.openai.com)',
    existingEnv.OPENAI_API_KEY || ''
  );
  
  const pineconeApiKey = await promptForEnvVar(
    'PINECONE_API_KEY', 
    'from console.pinecone.io',
    existingEnv.PINECONE_API_KEY || ''
  );
  
  const pineconeIndexName = await promptForEnvVar(
    'PINECONE_INDEX_NAME', 
    'typically "jfkfiles"',
    existingEnv.PINECONE_INDEX_NAME || 'jfkfiles'
  );
  
  const llmModel = await promptForEnvVar(
    'LLM_MODEL', 
    'OpenAI model to use',
    existingEnv.LLM_MODEL || 'gpt-4-turbo'
  );
  
  // Create or update local .env file
  const envContent = `OPENAI_API_KEY=${openaiApiKey}
PINECONE_API_KEY=${pineconeApiKey}
PINECONE_INDEX_NAME=${pineconeIndexName}
LLM_MODEL=${llmModel}`;
  
  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ Created local .env file');
  
  // Ask if user wants to set up Vercel environment
  rl.question('\nDo you want to set up these environment variables in Vercel? (y/n): ', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      try {
        // Set environment variables in Vercel
        console.log('\nSetting environment variables in Vercel...');
        
        execSync(`vercel env add OPENAI_API_KEY production`, { stdio: 'inherit' });
        execSync(`vercel env add PINECONE_API_KEY production`, { stdio: 'inherit' });
        execSync(`vercel env add PINECONE_INDEX_NAME production`, { stdio: 'inherit' });
        execSync(`vercel env add LLM_MODEL production`, { stdio: 'inherit' });
        
        console.log('\n✅ Environment variables set in Vercel');
        console.log('\nTo deploy your project, run:');
        console.log('vercel --prod');
      } catch (error) {
        console.error('❌ Failed to set environment variables in Vercel:', error.message);
      }
    } else {
      console.log('\nSkipping Vercel environment setup');
      console.log('You can manually set the environment variables in the Vercel dashboard');
    }
    
    console.log('\n✅ Setup complete!');
    console.log('Next steps:');
    console.log('1. Run "npm run ingest" to download and process JFK documents');
    console.log('2. Run "npm run dev" to start the development server');
    console.log('3. Deploy to Vercel with "vercel --prod"');
    
    rl.close();
  });
}

// Run the setup
setup(); 