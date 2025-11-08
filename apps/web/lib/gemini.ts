import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not configured. Please set it in your environment variables.');
}

const genAI = new GoogleGenerativeAI(apiKey);

export interface OrderItem {
  productName: string;
  quantity: number;
}

export interface MessageAnalysis {
  intent: 'create' | 'get' | 'update' | 'unknown';
  entityType: 'task' | 'reminder' | 'order' | 'product' | null;
  parameters: {
    title?: string;
    description?: string;
    dueDate?: string;
    orderId?: string;
    productName?: string;
    quantity?: number;
    items?: OrderItem[]; // Array of items for multiple products in a single order
    status?: string;
    taskId?: number;
    dateRange?: string; // e.g., "this week", "this month", "last week", "today", "yesterday"
    summary?: boolean; // true if user wants order summary
    [key: string]: any;
  };
}

export async function analyzeMessage(message: string): Promise<MessageAnalysis> {
  try {
    // Get model from environment variable, fallback to gemini-1.5-flash as default
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `Analyze the following WhatsApp message and extract the intent, entity type, and parameters. 
Return ONLY a valid JSON object with this exact structure:
{
  "intent": "create" | "get" | "update" | "unknown",
  "entityType": "task" | "reminder" | "order" | "product" | null,
  "parameters": {
    "title": "string (for tasks/reminders)",
    "description": "string (optional, for tasks)",
    "dueDate": "string (optional, for tasks/reminders, can be relative like 'tomorrow', 'next week', or absolute date)",
    "orderId": "string (for orders, extract number/ID from message)",
    "productName": "string (for orders/products, use only if single item)",
    "quantity": number (for orders/products, use only if single item),
    "items": [{"productName": "string", "quantity": number}] (for orders with MULTIPLE items - ALWAYS use this if multiple products detected),
    "fulfillmentDate": "string (for orders, extract when order needs to be fulfilled, e.g., 'tomorrow', 'next week', '15th November')",
    "status": "string (for updates: 'pending', 'completed', 'processing', 'cancelled'. For get intent: extract status filter like 'pending', 'completed', 'processing', 'cancelled' when user asks for 'pending orders', 'completed orders', etc.)",
    "taskId": number (for task updates, extract ID from message),
    "dateRange": "string (for get intent: extract date range filters like 'this week', 'this month', 'last week', 'today', 'yesterday', 'last month', 'next week', 'next month', 'tomorrow', etc. For bulk updates: extract date range when user says 'all today's', 'all yesterday's', 'all this week's', etc.)",
    "summary": boolean (for get intent: set to true if user asks for order summary/summaries),
    "isBulkUpdate": boolean (set to true if message contains bulk update keywords like 'all', 'every', 'all of', 'all my', 'all today's', etc.),
    "statusFilter": "string (for bulk updates: extract the status filter when user says 'all pending orders', 'all completed tasks', etc. - this is the CURRENT status to filter by, not the new status to set)"
  }
}

IMPORTANT RULES:
- Intent "create": User wants to create a new task, reminder, or order. This includes messages like:
  * "Have an appointment at..." → CREATE task/reminder
  * "Add appointment..." → CREATE task/reminder
  * "Create a task..." → CREATE task
  * "I need to..." → CREATE task (if it sounds like a task/reminder)
  * "Remind me to..." → CREATE reminder
  * "Order..." or "I want to order..." → CREATE order
  * If message contains multiple items (e.g., "order 5 laptops and 3 mice", "pineapple cake, pastries, chocolate chips"), use "items" array with all products
- Intent "get": User wants to view/list their tasks, reminders, or orders. This includes:
  * "show my tasks", "list orders", "what are my reminders", "my tasks", "orders this week", "tasks this month" → GET list
  * "show order details", "details of order ORD-123", "tell me about order 1", "what is order #123", "order information for ORD-123" → GET specific order details
  * "pending orders", "completed orders", "processing orders", "cancelled orders" → GET with status filter
  * "orders today", "orders tomorrow", "orders this week", "orders next week", "orders this month", "orders next month" → GET with dateRange filter
  * "order summary", "order summaries", "summary of orders", "orders summary for today/tomorrow/this week/next week/this month" → GET with summary=true and dateRange filter
  * Extract dateRange from phrases like "this week", "this month", "last week", "today", "yesterday", "last month", "this year", "next week", "next month", "tomorrow"
  * Extract status from phrases like "pending", "completed", "processing", "cancelled" when used with orders/tasks
  * Extract orderId from messages like "order ORD-123", "order #123", "order 1" (if order ID is mentioned)
  * If message contains "summary" or "summaries" with "order", set parameters.summary = true
- Intent "update": User wants to modify an existing task or order. This includes:
  * "mark task 1 as completed" → UPDATE task
  * "update order #123" → UPDATE order
  * "mark as done" → UPDATE (status: completed)
  * "update to done" → UPDATE (status: completed)
  * "set to completed" → UPDATE (status: completed)
  * "move to done" → UPDATE (status: completed)
  * "change status to processing" → UPDATE (status: processing)
  * "mark as completed" → UPDATE (status: completed)
  * "done" → UPDATE (status: completed)
  * "complete" → UPDATE (status: completed)
  * Any message containing status words like "done", "completed", "processing", "cancelled", "pending" when referring to existing items
  * BULK UPDATES: If message contains "all", "every", "all of", "all my", "all today's", "all yesterday's", "all this week's", etc., this is a BULK UPDATE:
    - "mark all today's orders as done" → UPDATE with dateRange: "today", status: "completed"
    - "update all pending orders to completed" → UPDATE with status filter: "pending", status: "completed"
    - "mark all tasks from this week as done" → UPDATE with dateRange: "this week", status: "completed"
    - "update all orders from yesterday" → UPDATE with dateRange: "yesterday"
    - "mark all my orders as done" → UPDATE (no filters, updates all orders)
    - "update all pending tasks to completed" → UPDATE with status filter: "pending", status: "completed"
    - For bulk updates, ALWAYS extract dateRange if mentioned (e.g., "today", "yesterday", "this week", "this month", "last week", "last month")
    - For bulk updates, extract status filter if mentioned (e.g., "all pending orders" → status filter: "pending")
    - Set parameters.isBulkUpdate = true if bulk update is detected
- Intent "unknown": Only use if truly cannot determine intent

Entity Type Rules:
- "task" or "reminder": Use for appointments, tasks, reminders, things to do, events
- "order" or "product": Use for purchases, orders, products, items to buy

Date Extraction:
- Extract dates from messages like "Saturday 15th November", "2PM on Saturday", "tomorrow", "next week"
- For appointments with time, include both date and time in dueDate
- Parse dates like "Saturday 15th November" or "15th November" into a proper date format
- Relative dates: "tomorrow" = next day, "next week" = 7 days from now, etc.

Title Extraction:
- For appointments: Extract the main subject (e.g., "appointment", "meeting", "doctor visit")
- For tasks: Extract the task description
- If message says "appointment" or "have an appointment", use "Appointment" as title

Examples:
- "Have an appointment at 2PM on Saturday 15th November" → {"intent": "create", "entityType": "task", "parameters": {"title": "Appointment", "dueDate": "Saturday 15th November 2PM"}}
- "Add appointment at 2PM on Saturday 15th November" → {"intent": "create", "entityType": "task", "parameters": {"title": "Appointment", "dueDate": "Saturday 15th November 2PM"}}
- "Create a task to buy groceries tomorrow" → {"intent": "create", "entityType": "task", "parameters": {"title": "buy groceries", "dueDate": "tomorrow"}}
- "mark all today's orders as done" → {"intent": "update", "entityType": "order", "parameters": {"status": "completed", "dateRange": "today", "isBulkUpdate": true}}
- "update all pending orders to completed" → {"intent": "update", "entityType": "order", "parameters": {"status": "completed", "statusFilter": "pending", "isBulkUpdate": true}}
- "mark all tasks from this week as done" → {"intent": "update", "entityType": "task", "parameters": {"status": "completed", "dateRange": "this week", "isBulkUpdate": true}}
- "update all my orders as done" → {"intent": "update", "entityType": "order", "parameters": {"status": "completed", "isBulkUpdate": true}}

Message: "${message}"

Return ONLY the JSON object, no other text:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response (handle cases where LLM adds extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response:', text);
      return {
        intent: 'unknown',
        entityType: null,
        parameters: {},
      };
    }

    const analysis = JSON.parse(jsonMatch[0]) as MessageAnalysis;

    // Validate the analysis structure
    if (!analysis.intent || !['create', 'get', 'update', 'unknown'].includes(analysis.intent)) {
      analysis.intent = 'unknown';
    }

    if (analysis.entityType && !['task', 'reminder', 'order', 'product'].includes(analysis.entityType)) {
      analysis.entityType = null;
    }

    return analysis;
  } catch (error) {
    console.error('Error analyzing message with Gemini:', error);
    // Return unknown intent on error
    return {
      intent: 'unknown',
      entityType: null,
      parameters: {},
    };
  }
}

export interface TaskMatch {
  taskId: number;
  confidence: number; // 0-1, where 1 is highest confidence
  ambiguity: number; // 0-1, where 1 is highest ambiguity (multiple good matches)
  reason: string;
}

export interface TaskMatchResult {
  bestMatch: TaskMatch | null;
  allMatches: TaskMatch[];
  needsConfirmation: boolean;
}

export async function findMatchingTask(
  userMessage: string,
  tasks: Array<{ id: number; title: string; description: string | null; due_date: Date | null; status: string }>
): Promise<TaskMatchResult> {
  try {
    if (tasks.length === 0) {
      return {
        bestMatch: null,
        allMatches: [],
        needsConfirmation: false,
      };
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    // Format tasks for the prompt
    const tasksList = tasks.map((task, index) => {
      const dueDateStr = task.due_date
        ? new Date(task.due_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'No due date';
      return `${index + 1}. Task ID: ${task.id}, Title: "${task.title}", Description: ${task.description || 'None'}, Due Date: ${dueDateStr}, Status: ${task.status}`;
    }).join('\n');

    const prompt = `You are analyzing a user's message to find which task they want to update from their list of tasks.

User's message: "${userMessage}"

Available tasks:
${tasksList}

Analyze the user's message and find the best matching task(s). Consider:
- Date references (e.g., "15th", "19th", "from 15th to 19th")
- Task titles or keywords
- Context clues

Return ONLY a valid JSON object with this exact structure:
{
  "matches": [
    {
      "taskId": number (the actual task ID from the list),
      "confidence": number (0.0 to 1.0, where 1.0 is highest confidence),
      "reason": "string explaining why this task matches"
    }
  ],
  "needsConfirmation": boolean (true if confidence < 0.8 OR if multiple tasks have confidence > 0.6)
}

Rules:
- confidence >= 0.8 and only one match → needsConfirmation: false (high confidence, single match)
- confidence < 0.8 OR multiple matches with confidence > 0.6 → needsConfirmation: true (low confidence or ambiguous)
- Sort matches by confidence (highest first)
- If no good match (all confidence < 0.5), return empty matches array

Return ONLY the JSON object, no other text:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in task matching response:', text);
      return {
        bestMatch: null,
        allMatches: [],
        needsConfirmation: false,
      };
    }

    const matchData = JSON.parse(jsonMatch[0]) as {
      matches: Array<{ taskId: number; confidence: number; reason: string }>;
      needsConfirmation: boolean;
    };

    // Calculate ambiguity (if multiple high-confidence matches)
    const highConfidenceMatches = matchData.matches.filter(m => m.confidence > 0.6);
    const ambiguity = highConfidenceMatches.length > 1 ? 1.0 : 0.0;

    const allMatches: TaskMatch[] = matchData.matches.map(m => ({
      taskId: m.taskId,
      confidence: m.confidence,
      ambiguity,
      reason: m.reason,
    }));

    const bestMatch = allMatches.length > 0 ? allMatches[0] : null;

    // Determine if confirmation is needed
    const needsConfirmation =
      matchData.needsConfirmation ||
      (bestMatch && bestMatch.confidence < 0.8) ||
      (highConfidenceMatches.length > 1);

    return {
      bestMatch,
      allMatches,
      needsConfirmation,
    };
  } catch (error) {
    console.error('Error finding matching task:', error);
    return {
      bestMatch: null,
      allMatches: [],
      needsConfirmation: false,
    };
  }
}

/**
 * Analyze an image using Gemini Vision API to extract information
 * This can extract order information, task information, or any other relevant data from images
 * 
 * @param imageBuffer - Buffer containing the image data
 * @param mimeType - MIME type of the image (e.g., 'image/jpeg', 'image/png')
 * @param retryCount - Internal parameter for retry attempts (default: 0)
 * @returns Extracted text and analysis of the image content
 */
export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg',
  retryCount: number = 0
): Promise<{ extractedText: string; analysis: MessageAnalysis }> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second base delay
  
  try {
    // Use a vision-capable model for image analysis
    // Priority: GEMINI_IMAGE_MODEL > GEMINI_VISION_MODEL > default
    // gemini-2.5-flash-image-preview is optimized for image analysis
    // gemini-1.5-flash also supports vision but may be less optimized
    let visionModelName = 
      process.env.GEMINI_IMAGE_MODEL || 
      process.env.GEMINI_VISION_MODEL || 
      'gemini-1.5-flash';
    
    // If we're retrying due to quota error, try fallback model
    if (retryCount > 0 && visionModelName.includes('2.5-flash-image-preview')) {
      visionModelName = 'gemini-1.5-flash'; // Fallback to standard model
      console.log(`Retrying with fallback model: ${visionModelName}`);
    }
    
    const model = genAI.getGenerativeModel({ model: visionModelName });

    const prompt = `Analyze this image and extract all relevant information. 

If the image contains:
- Products, items, shopping lists, or order information → Extract as ORDER/PRODUCT information
- Tasks, reminders, appointments, or to-do items → Extract as TASK/REMINDER information
- Text content → Extract the text
- Multiple items → Extract ALL items (create a list)

For ORDERS/PRODUCTS, extract:
- Product names
- Quantities
- Any dates or deadlines
- Order IDs if visible
- Any other relevant order information

For TASKS/REMINDERS, extract:
- Task titles
- Descriptions
- Due dates or deadlines
- Any other relevant task information

Return a JSON object with this structure:
{
  "extractedText": "string (all text content visible in the image, or description of what's in the image)",
  "intent": "create" | "get" | "update" | "unknown",
  "entityType": "task" | "reminder" | "order" | "product" | null,
  "parameters": {
    "title": "string (for tasks/reminders)",
    "description": "string (optional)",
    "productName": "string (for orders/products, use ONLY if single item - if multiple items, use 'items' array instead)",
    "quantity": number (for orders/products, use ONLY if single item - if multiple items, use 'items' array instead),
    "items": [{"productName": "string", "quantity": number}] (REQUIRED if multiple products/items are detected - ALWAYS use this array when you see multiple distinct products),
    "dueDate": "string (if any dates/deadlines are visible)",
    "fulfillmentDate": "string (for orders, if deadline visible)",
    "orderId": "string (if order ID visible)",
    "status": "string (if status information visible)"
  }
}

IMPORTANT:
- If multiple items/products are visible (e.g., "pineapple cake", "pastries", "chocolate chips"), ALWAYS use the "items" array
- DO NOT use "productName" and "quantity" if multiple items are detected - use "items" array instead
- Extract ALL items with their quantities separately
- Extract ALL text visible in the image
- Be specific about quantities and product names
- If dates are visible, extract them in a readable format
- Example: If image shows "pineapple cake 1kg, pastries 4 slices, chocolate chips 1kg", return:
  {
    "items": [
      {"productName": "pineapple cake", "quantity": 1},
      {"productName": "pastries", "quantity": 4},
      {"productName": "chocolate chips", "quantity": 1}
    ]
  }

Return ONLY the JSON object, no other text:`;

    // Use vision API with image
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: mimeType,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini image analysis response:', text);
      return {
        extractedText: text || 'Could not extract information from image',
        analysis: {
          intent: 'unknown',
          entityType: null,
          parameters: {},
        },
      };
    }

    const imageData = JSON.parse(jsonMatch[0]) as {
      extractedText: string;
      intent?: string;
      entityType?: string;
      parameters?: any;
    };

    // Build the analysis object
    const analysis: MessageAnalysis = {
      intent: (imageData.intent as any) || 'create',
      entityType: (imageData.entityType as any) || null,
      parameters: imageData.parameters || {},
    };

    // Validate intent
    if (!['create', 'get', 'update', 'unknown'].includes(analysis.intent)) {
      analysis.intent = 'create'; // Default to create for images
    }

    // Validate entity type
    if (analysis.entityType && !['task', 'reminder', 'order', 'product'].includes(analysis.entityType)) {
      analysis.entityType = null;
    }

    return {
      extractedText: imageData.extractedText || text || 'Could not extract information from image',
      analysis,
    };
  } catch (error: any) {
    // Check if it's a rate limit/quota error
    const isRateLimitError = 
      error?.status === 429 || 
      error?.message?.includes('429') ||
      error?.message?.includes('quota') ||
      error?.message?.includes('rate limit') ||
      error?.errorDetails?.some((detail: any) => 
        detail['@type']?.includes('QuotaFailure') || 
        detail['@type']?.includes('RetryInfo')
      );

    if (isRateLimitError && retryCount < maxRetries) {
      // Extract retry delay from error if available
      let retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
      
      const retryInfo = error?.errorDetails?.find((detail: any) => 
        detail['@type']?.includes('RetryInfo')
      );
      if (retryInfo?.retryDelay) {
        // Parse retry delay (e.g., "11s" or "11.4s")
        const delayMatch = retryInfo.retryDelay.match(/(\d+\.?\d*)/);
        if (delayMatch) {
          retryDelay = parseFloat(delayMatch[1]) * 1000; // Convert to milliseconds
        }
      }

      console.log(`Rate limit/quota error. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Retry with incremented count
      return analyzeImage(imageBuffer, mimeType, retryCount + 1);
    }

    // If it's a rate limit error but we've exhausted retries, provide helpful message
    if (isRateLimitError) {
      console.error('Gemini API quota/rate limit exceeded after retries:', error);
      return {
        extractedText: 'I\'m currently experiencing high demand. Please try again in a few moments, or describe what\'s in the image in a text message.',
        analysis: {
          intent: 'unknown',
          entityType: null,
          parameters: {},
        },
      };
    }

    // For other errors, log and return error message
    console.error('Error analyzing image with Gemini:', error);
    return {
      extractedText: 'I had trouble analyzing the image. Please try sending a text description instead.',
      analysis: {
        intent: 'unknown',
        entityType: null,
        parameters: {},
      },
    };
  }
}

