import { GoogleGenAI } from "@google/genai";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ai = new GoogleGenAI({});
const MODEL_NAME = "gemini-2.5-flash";
const FALLBACK_MODEL = "google translate";

const safetySettings = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_CIVIC_INTEGRITY",
    threshold: "BLOCK_NONE",
  }
];

async function fetchJson(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error fetching JSON:', error);
    process.exit(1);
  }
}

function parseRange(rangeStr, maxItems) {
  const [startStr, endStr] = rangeStr.split('-');
  let start = parseInt(startStr);
  let end = endStr ? parseInt(endStr) : start;

  // Validate range
  if (isNaN(start)) start = 1;
  if (isNaN(end)) end = maxItems;
  if (start < 1) start = 1;
  if (end > maxItems) end = maxItems;
  if (start > end) [start, end] = [end, start]; // Swap if reversed

  return { start, end };
}

async function translateContent(content) {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: content,
      config: {
        systemInstruction: "You are a strict translator. Do not modify the story, characters, or intent. Preserve all names of people, but translate techniques/props/places/organizations when readability benefits. Prioritize natural English flow while keeping the original's tone (humor, sarcasm, etc.). For idioms or culturally specific terms, translate literally if possible; otherwise, adapt with a footnote. Dialogue must match the original's bluntness or subtlety, including punctuation.",
        safetySettings: safetySettings,
      }
    });

    // Check if response contains text
    if (response && response.text) {
      return {
        translated: true,
        content: response.text,
        model: MODEL_NAME
      };
    }
    throw new Error('Empty response from API');
  } catch (error) {
    console.error('Translation error:', error.message);
    return {
      translated: false,
      content: content, // Return original content
      model: FALLBACK_MODEL
    };
  }
}

async function main(jsonUrl, rangeStr) {
  try {
    // Fetch and parse the JSON
    const jsonData = await fetchJson(jsonUrl);
    if (!Array.isArray(jsonData)) {
      throw new Error('Invalid JSON format: Expected an array');
    }

    // Parse the range
    const { start, end } = parseRange(rangeStr, jsonData.length);
    console.log(`Processing items ${start} to ${end} of ${jsonData.length}`);

    // Create results directory
    const resultsDir = path.join(__dirname, '../results');
    await fs.mkdir(resultsDir, { recursive: true });

    // Extract filename from URL and create output filename with range
    const filename = path.basename(jsonUrl, '.json');
    const outputPath = path.join(resultsDir, `${filename}_translated_${start}_${end}.json`);

    // Process each item in range
    const translatedItems = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = start - 1; i < end; i++) {
      const item = jsonData[i];
      console.log(`Translating item ${i + 1}: ${item.title}`);
      
      const translationResult = await translateContent(item.content);
      translatedItems.push({
        title: item.title,
        content: translationResult.content,
        translated: translationResult.translated,
        model: translationResult.model
      });

      if (translationResult.translated) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Save the translated items
    await fs.writeFile(outputPath, JSON.stringify(translatedItems, null, 2));
    console.log(`\nTranslation summary:`);
    console.log(`- Successfully translated (${MODEL_NAME}): ${successCount}`);
    console.log(`- Failed to translate (${FALLBACK_MODEL}): ${failCount}`);
    console.log(`Translated results saved to ${outputPath}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Get command line arguments
const [jsonUrl, range] = process.argv.slice(2);
if (!jsonUrl || !range) {
  console.error('Usage: node ai_query.js <json_url> <range>');
  process.exit(1);
}

await main(jsonUrl, range);
