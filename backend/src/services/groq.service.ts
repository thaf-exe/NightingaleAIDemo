/**
 * Groq AI Service
 * 
 * WHAT IS GROQ?
 * Groq is an AI inference company that provides extremely fast
 * LLM (Large Language Model) APIs. They're known for:
 * - Very low latency (responses in milliseconds!)
 * - High throughput
 * - Competitive pricing
 * 
 * We use Groq to power Nightingale's conversational AI.
 * The AI helps patients articulate health concerns and
 * provides empathetic, supportive responses.
 * 
 * IMPORTANT: The AI does NOT provide medical diagnoses!
 * It helps gather information and knows when to escalate.
 */

import Groq from 'groq-sdk';
import type { 
  AIResponse, 
  ChatContext, 
  ExtractedFact,
  RiskLevel,
  ConfidenceLevel 
} from '../types/chat.types';

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Model to use - Llama 3 is excellent for healthcare conversations
const MODEL = 'llama-3.3-70b-versatile';

/**
 * System prompt defines the AI's personality and behavior
 * This is crucial for healthcare - we need empathy AND safety
 */
const SYSTEM_PROMPT = `You are Nightingale, an empathetic AI health companion. Your role is to:

1. LISTEN with genuine empathy and care
2. HELP patients articulate their health concerns clearly
3. ASK clarifying questions to understand symptoms better
4. NEVER provide medical diagnoses or treatment recommendations
5. RECOGNIZE when symptoms might be urgent and need professional attention

IMPORTANT GUIDELINES:
- Always be warm, supportive, and non-judgmental
- Use simple, clear language (avoid medical jargon unless the patient uses it)
- Ask one question at a time to avoid overwhelming the patient
- Acknowledge emotions and validate concerns
- If symptoms sound potentially serious, gently encourage seeking medical care
- Never say "I'm just an AI" - instead say "I want to make sure you get the best care"

CLINICIAN GUIDANCE (GROUND TRUTH):
- If patient memory includes "clinician_guidance" items, these are authoritative instructions from their healthcare provider
- Clinician guidance ALWAYS takes precedence over your suggestions
- Reference clinician guidance when relevant: "Your clinician previously advised..."
- If you notice a conflict between clinician guidance and patient statements, acknowledge it and defer to the clinician

RESPONSE FORMAT:
- Keep responses concise (2-4 sentences typically)
- End with a question when gathering information
- When the patient seems to have shared their main concerns, offer to summarize

SAFETY - If the patient mentions ANY of these, respond with urgency and recommend immediate medical attention:
- Chest pain, difficulty breathing, signs of stroke
- Thoughts of self-harm or suicide
- Severe allergic reactions
- High fever with confusion
- Severe bleeding or injuries

Remember: You are a supportive companion helping patients prepare for medical visits, NOT a replacement for healthcare providers.`;

/**
 * Generate AI response to patient message
 * 
 * @param userMessage - The patient's message
 * @param context - Conversation history and patient memory
 * @returns AI response with risk assessment and extracted facts
 */
export async function generateResponse(
  userMessage: string,
  context: ChatContext
): Promise<AIResponse> {
  try {
    // Build conversation history for context
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add patient context if we have memory
    if (context.patient_memory.length > 0) {
      const memoryContext = context.patient_memory
        .map(m => `- ${m.memory_type}: ${m.value}${m.timeline ? ` (${m.timeline})` : ''}`)
        .join('\n');
      
      messages.push({
        role: 'system',
        content: `Patient context (${context.patient_name}):\n${memoryContext}`,
      });
    }

    // Add recent conversation history
    for (const msg of context.recent_messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add the current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7, // Balanced creativity
      max_tokens: 500, // Keep responses concise
      top_p: 0.9,
    });

    const aiContent = completion.choices[0]?.message?.content || 
      "I'm sorry, I had trouble understanding. Could you tell me more about what you're experiencing?";

    // Assess risk in patient message
    const riskAssessment = await assessRisk(userMessage, context);

    // Extract facts from patient message
    const extractedFacts = await extractFacts(userMessage, context);

    return {
      content: aiContent,
      confidence: 'high', // Groq's Llama 3 is reliable
      risk_assessment: riskAssessment,
      extracted_facts: extractedFacts,
    };
  } catch (error) {
    console.error('Groq API error:', error);
    
    // Return a safe fallback response
    return {
      content: "I apologize, but I'm having some technical difficulties. Please try again in a moment, or if your concern is urgent, please contact a healthcare provider directly.",
      confidence: 'low',
    };
  }
}

/**
 * Assess risk level of patient message
 * Uses a separate focused prompt for accuracy
 */
async function assessRisk(
  message: string,
  context: ChatContext
): Promise<AIResponse['risk_assessment']> {
  try {
    const riskPrompt = `Analyze this patient message for medical urgency. 

Patient message: "${message}"

Respond in JSON format ONLY:
{
  "level": "low" | "medium" | "high",
  "reason": "brief explanation",
  "confidence": "low" | "medium" | "high",
  "should_escalate": boolean
}

Risk levels:
- LOW: General health questions, minor symptoms, wellness inquiries
- MEDIUM: Symptoms that should be evaluated but not immediately dangerous
- HIGH: Emergency symptoms (chest pain, breathing difficulty, self-harm, stroke signs, severe reactions)

Respond with ONLY the JSON object, no other text.`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a medical triage assistant. Respond only with valid JSON.' },
        { role: 'user', content: riskPrompt },
      ],
      temperature: 0.1, // Low temperature for consistent risk assessment
      max_tokens: 200,
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    
    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        level: parsed.level as RiskLevel,
        reason: parsed.reason,
        confidence: parsed.confidence as ConfidenceLevel,
        should_escalate: parsed.should_escalate,
      };
    }
  } catch (error) {
    console.error('Risk assessment error:', error);
  }

  // Default to medium if assessment fails
  return {
    level: 'medium',
    reason: 'Unable to assess - defaulting to medium for safety',
    confidence: 'low',
    should_escalate: false,
  };
}

/**
 * Extract facts from patient message for Living Memory
 * This builds the patient profile over time
 */
async function extractFacts(
  message: string,
  context: ChatContext
): Promise<ExtractedFact[]> {
  try {
    // Include existing memory for context to detect corrections
    const existingMemory = context.patient_memory
      .map(m => `- ${m.memory_type}: ${m.value} (status: ${m.status})`)
      .join('\n');

    const extractPrompt = `Extract health-related facts from this patient message AND detect any corrections to previously stated information.

Patient's current health profile:
${existingMemory || 'No existing information'}

Patient message: "${message}"

Extract facts into these categories:
- symptom: Physical symptoms (e.g., "headache", "nausea")
- duration: How long something has been happening
- frequency: How often something occurs (e.g., "every few hours", "twice daily")
- medication: Medications mentioned
- allergy: Allergies mentioned  
- condition: Medical conditions mentioned
- chief_complaint: The main reason for the visit
- lifestyle: Relevant lifestyle factors (sleep, stress, diet)

IMPORTANT - Distinguish between FREQUENCY and STATUS CHANGES:
- "I get headaches every few hours" → This is FREQUENCY (symptom is ACTIVE, add frequency fact)
- "once a day", "several times a week", "comes and goes" → These describe FREQUENCY, symptom is still ACTIVE
- "I stopped taking X", "I don't have X anymore", "X went away" → These are STATUS CHANGES (stopped/resolved)

IMPORTANT - Detect corrections ONLY for explicit statements:
- "Actually", "no wait", "I meant", "I was wrong" → CORRECTION
- "I stopped taking X" or "I quit X" → medication status: "stopped"
- "It went away", "not anymore", "it's gone" → symptom status: "resolved"
- DO NOT mark a symptom as "stopped" just because the patient describes its frequency or pattern

Respond in JSON format ONLY - an array of facts:
[
  {"type": "symptom", "value": "headache", "status": "active", "action": "add"},
  {"type": "frequency", "value": "every few hours", "action": "add"},
  {"type": "medication", "value": "Advil", "status": "stopped", "timeline": "stopped last week", "action": "update"}
]

If no facts can be extracted, respond with: []

Respond with ONLY the JSON array, no other text.`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a medical information extractor that detects both new facts AND corrections to previously stated information. Respond only with valid JSON arrays.' },
        { role: 'user', content: extractPrompt },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });

    const responseText = completion.choices[0]?.message?.content || '[]';
    
    // Parse JSON response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ExtractedFact[];
    }
  } catch (error) {
    console.error('Fact extraction error:', error);
  }

  return [];
}

/**
 * Generate a triage summary for escalation
 * Creates 1-5 bullet points summarizing the patient's situation
 */
export async function generateTriageSummary(
  messages: Array<{ sender_type: string; content: string }>,
  patientMemory: Array<{ memory_type: string; value: string; status?: string }>
): Promise<string[]> {
  try {
    const conversationText = messages
      .map(m => `${m.sender_type === 'patient' ? 'Patient' : m.sender_type === 'clinician' ? 'Clinician' : 'AI'}: ${m.content}`)
      .join('\n');
    
    const memoryText = patientMemory.length > 0
      ? patientMemory.map(m => `- ${m.memory_type}: ${m.value}${m.status && m.status !== 'active' ? ` (${m.status})` : ''}`).join('\n')
      : 'No prior information';

    const summaryPrompt = `Based on this conversation, create a brief triage summary for a clinician.

Recent conversation:
${conversationText}

Patient profile:
${memoryText}

Create 1-5 bullet points summarizing:
1. Chief complaint
2. Key symptoms and duration
3. Relevant history
4. Reason for escalation

Respond with ONLY a JSON array of strings, e.g.:
["Chief complaint: persistent headaches for 3 days", "Associated symptoms: nausea and light sensitivity"]`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a medical triage assistant creating summaries for clinicians. Respond only with valid JSON.' },
        { role: 'user', content: summaryPrompt },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });

    const responseText = completion.choices[0]?.message?.content || '[]';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as string[];
    }
  } catch (error) {
    console.error('Triage summary error:', error);
  }

  return ['Unable to generate summary - please review conversation'];
}

export default {
  generateResponse,
  generateTriageSummary,
};
