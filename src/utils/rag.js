import { getApiKey } from './gemini.js';
import { readJson, writeJson } from './storage.js';

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Call Gemini Embedding API
export async function generateEmbedding(text) {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] }
      })
    });
    const data = await res.json();
    return data.embedding?.values || null;
  } catch (e) {
    console.error("[RAG] Embedding failed", e);
    return null;
  }
}

// Store a memory with its embedding
export async function storeSemanticMemory(text, category = 'chat') {
  const vector = await generateEmbedding(text);
  if (!vector) return false;
  
  const memories = await readJson('jarvis-semantic-memory.json') || [];
  memories.push({
    id: Date.now().toString(),
    text,
    category,
    vector,
    timestamp: new Date().toISOString()
  });
  
  await writeJson('jarvis-semantic-memory.json', memories);
  return true;
}

// Retrieve relevant memories
export async function searchSemanticMemory(query, topK = 3) {
  const queryVector = await generateEmbedding(query);
  if (!queryVector) return [];
  
  const memories = await readJson('jarvis-semantic-memory.json') || [];
  if (memories.length === 0) return [];
  
  const scored = memories.map(m => ({
    text: m.text,
    timestamp: m.timestamp,
    score: cosineSimilarity(queryVector, m.vector)
  }));
  
  scored.sort((a, b) => b.score - a.score);
  // Filter out low confidence matches (threshold > 0.65)
  return scored.filter(m => m.score > 0.65).slice(0, topK);
}
