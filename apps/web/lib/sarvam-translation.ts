import axios from 'axios';

const API_BASE_URL = 'https://api.sarvam.ai';
const TRANSLATE_ENDPOINT = `${API_BASE_URL}/text/translate`;

export interface SarvamTranslationResponse {
  translated_text: string;
  source_language?: string;
  target_language?: string;
  [key: string]: any;
}

export interface SarvamTranslationOptions {
  source_language_code?: string; // 'auto' for auto-detection, or specific language code
  target_language_code?: string; // Default: 'en' for English
}

/**
 * Translate text using Sarvam.ai Translation API
 * Supports Indian languages and code-mixed inputs like Tenglish, Hinglish, etc.
 * 
 * @param text - Text to translate (can be mixed language like Tenglish, Hinglish)
 * @param options - Optional parameters (source_language, target_language)
 * @returns Translated text in target language (default: English)
 * 
 * @throws Error if API key is not configured or translation fails
 * 
 * Example:
 * - Input: "Nenu school ki late ayyanu because traffic chala undhi."
 * - Output: "I was late to school because there was a lot of traffic."
 */
export async function translateText(
  text: string,
  options: SarvamTranslationOptions = {}
): Promise<string> {
  const apiKey = process.env.SARVAM_AI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'SARVAM_AI_API_KEY is not configured. Please set it in your environment variables.'
    );
  }

  // Default to auto-detect source language and translate to English
  const sourceLanguageCode = options.source_language_code || 'auto';
  const targetLanguageCode = options.target_language_code || 'en';

  // If text is empty or only whitespace, return as-is
  if (!text || !text.trim()) {
    return text;
  }

  try {
    const response = await axios.post(
      TRANSLATE_ENDPOINT,
      {
        input: text,
        source_language_code: sourceLanguageCode,
        target_language_code: targetLanguageCode,
      },
      {
        headers: {
          'api-subscription-key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    const result: SarvamTranslationResponse = response.data;
    
    // Check for translated text in various possible field names
    const translatedText = result.translated_text || 
                          result.translatedText || 
                          result.text || 
                          result.output || 
                          (result as any).translation ||
                          text;
    
    if (translatedText === text) {
      console.warn('Translation API did not return translated text, using original');
      console.log('API response:', JSON.stringify(result, null, 2));
    } else {
      console.log('Translation successful:', { original: text.substring(0, 50), translated: translatedText.substring(0, 50) });
    }

    return translatedText;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const errorBody = error.response?.data;
      const requestUrl = error.config?.url;
      const requestData = error.config?.data;
      
      let parsedRequestData = null;
      try {
        if (requestData) {
          parsedRequestData = typeof requestData === 'string' ? JSON.parse(requestData) : requestData;
        }
      } catch (e) {
        parsedRequestData = requestData;
      }
      
      console.error('Sarvam.ai Translation API error:', {
        status,
        statusText,
        url: requestUrl,
        endpoint: TRANSLATE_ENDPOINT,
        requestData: parsedRequestData,
        responseBody: errorBody,
      });
      
      // If translation fails, log error but return original text to avoid breaking the flow
      console.warn('Translation failed, using original text:', text);
      return text;
    }
    
    console.error('Error translating text with Sarvam.ai:', error);
    // Return original text on error to avoid breaking the flow
    return text;
  }
}

/**
 * Detect if text contains non-English or mixed-language content
 * This is a simple heuristic - can be enhanced with actual language detection
 * 
 * @param text - Text to check
 * @returns true if text might contain non-English content
 */
export function mightContainNonEnglish(text: string): boolean {
  if (!text || !text.trim()) {
    return false;
  }

  // Simple heuristic: Check for common Indian language patterns
  // This is a basic check - actual implementation might use language detection API
  
  // Check for common Telugu words in Tenglish
  const teluguPatterns = /\b(nenu|ni|me|manam|vadu|adi|idi|akkada|ikkada|chala|undhi|ayyanu|vachanu|velthunna|vastunna|chesthunna|cheyali|avasaram|ledhu|undhi|kaadhu)\b/gi;
  
  // Check for common Hindi words in Hinglish
  const hindiPatterns = /\b(main|tum|aap|hum|woh|yeh|wahan|yahan|bahut|hai|hain|nahi|nahin|kya|kaise|kab|kahan|kyun|chahiye|karna|kar|raha|rahi|rahe|gaya|gayi|gaye|tha|thi|the)\b/gi;
  
  // Check for Devanagari script (Hindi, Marathi, etc.)
  const devanagariPattern = /[\u0900-\u097F]/;
  
  // Check for Telugu script
  const teluguPattern = /[\u0C00-\u0C7F]/;
  
  // Check for Tamil script
  const tamilPattern = /[\u0B80-\u0BFF]/;
  
  // Check for Kannada script
  const kannadaPattern = /[\u0C80-\u0CFF]/;
  
  // Check for Malayalam script
  const malayalamPattern = /[\u0D00-\u0D7F]/;
  
  return (
    teluguPatterns.test(text) ||
    hindiPatterns.test(text) ||
    devanagariPattern.test(text) ||
    teluguPattern.test(text) ||
    tamilPattern.test(text) ||
    kannadaPattern.test(text) ||
    malayalamPattern.test(text)
  );
}

/**
 * Translate text if it contains non-English content, otherwise return as-is
 * This is a convenience function that combines detection and translation
 * 
 * @param text - Text to translate
 * @param options - Optional translation parameters
 * @param forceTranslate - If true, translate even if no non-English is detected
 * @returns Translated text (or original if already English and forceTranslate is false)
 */
export async function translateIfNeeded(
  text: string,
  options: SarvamTranslationOptions = {},
  forceTranslate: boolean = false
): Promise<string> {
  if (!text || !text.trim()) {
    return text;
  }

  // If force translate is enabled, always translate
  if (forceTranslate) {
    return await translateText(text, options);
  }

  // Check if text might contain non-English content
  if (mightContainNonEnglish(text)) {
    return await translateText(text, options);
  }

  // Text appears to be English, return as-is
  return text;
}

