import Groq from 'groq-sdk';
import type { 
  AIResponse, 
  ChatContext, 
  ExtractedFact,
  RiskLevel,
  ConfidenceLevel 
} from '../types/chat.types';
import { redactPhi, restorePhi, getRedactionStats, type RedactionMap } from '../utils/redaction.utils';
import { logPhiRedaction, logSystemError } from '../utils/logger.utils';

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


const MODEL = 'llama-3.3-70b-versatile';


const SYSTEM_PROMPT = `You are Nightingale, a friendly health companion here to listen and help.

Your goal: Help people talk through what's going on with their health. You're like a caring friend who gets it - not a stiff medical bot.

How to chat:
- Be warm and genuinely curious. Ask real questions like a friend would.
- Let them talk naturally. Don't overwhelm with lots of questions.
- If something sounds serious, suggest seeing a doctor without being scary about it
- Use everyday language, not medical speak (unless they do first)
- Keep it real - acknowledge when something sounds tough
- Remember what they've told you and connect the dots

When referencing what they've told you, add citations:
- If you mention something they said before, add [their previous message] after it
- If you reference their medical history/profile, add [their health profile] after it
- Example: "You mentioned [your health profile] that you take Aspirin, so..."

What NOT to do:
- Don't pretend to diagnose anything
- Don't give medical advice beyond general education
- Never make them feel judged
- Don't be robotic or overly formal

CRITICAL - Always include when applicable:
- For ANY health topic where there's uncertainty: "That said, your doctor knows your full situation best - definitely run this by them."
- For lifestyle/symptoms/concerns you're not 100% sure about: "Worth checking with your clinician about this."
- For things that might change treatment: "If this is new, your clinician should know."

If they mention anything really serious (chest pain, can't breathe, thinking about hurting themselves, severe allergic reaction, major bleeding) - tell them straight up: "This sounds urgent. Please get medical help right now. Call 911 or go to the ER."

If their doctor gave them specific instructions, follow those. That's the real deal.

Keep responses short and natural. One or two sentences is usually better than a paragraph. End with a question when you're learning about what's going on.

You're here to help them feel heard and get to a doctor if they need one. That's it.`;

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
    // CRITICAL: Redact PHI before sending to LLM
    const knownNames = context.knownNames || [];
    const userMessageRedaction = redactPhi(userMessage, knownNames);
    
    // Build conversation history for context
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add patient context if we have memory (REDACTED)
    if (context.patient_memory.length > 0) {
      const memoryContext = context.patient_memory
        .map(m => `- ${m.memory_type}: ${m.value}${m.timeline ? ` (${m.timeline})` : ''}`)
        .join('\n');
      
      // Redact memory context
      const memoryRedaction = redactPhi(memoryContext, knownNames);
      
      messages.push({
        role: 'system',
        content: `Patient context ([PATIENT_ID]):\n${memoryRedaction.redactedText}`,
      });
    }

    // Add recent conversation history (REDACTED)
    for (const msg of context.recent_messages) {
      const msgRedaction = redactPhi(msg.content, knownNames);
      messages.push({
        role: msg.role,
        content: msgRedaction.redactedText,
      });
    }

    // Add the current user message (REDACTED)
    messages.push({
      role: 'user',
      content: userMessageRedaction.redactedText,
    });
    
    // Log redaction stats for audit
    const stats = getRedactionStats(userMessageRedaction.map);
    if (stats.totalRedactions > 0) {
      logPhiRedaction(
        stats.namesRedacted,
        stats.idNumbersRedacted,
        stats.phonesRedacted
      );
    }

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7, // Balanced creativity
      max_tokens: 500, // Keep responses concise
      top_p: 0.9,
    });

    const aiContentRaw = completion.choices[0]?.message?.content || 
      "I'm sorry, I had trouble understanding. Could you tell me more about what you're experiencing?";
    
    // CRITICAL: Restore PHI in AI response
    const aiContent = restorePhi(aiContentRaw, userMessageRedaction.map);

    // Assess risk in patient message (use ORIGINAL unredacted message for accurate assessment)
    const riskAssessment = await assessRisk(userMessage, context);

    // Extract facts from patient message
    const extractedFacts = await extractFacts(userMessage, context);

    // Extract citations from response
    const citations = extractCitations(aiContent);

    // Determine confidence based on risk level and response quality
    const confidence = riskAssessment?.should_escalate ? 'low' : 'high';

    return {
      content: aiContent,
      confidence,
      risk_assessment: riskAssessment,
      extracted_facts: extractedFacts,
      citations: citations.length > 0 ? citations : undefined,
    };
  } catch (error) {
    logSystemError('groq.api_error', 'Failed to generate AI response', error);
    
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
    logSystemError('groq.risk_assessment_error', 'Risk assessment failed', error);
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
    logSystemError('groq.fact_extraction_error', 'Fact extraction failed', error);
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
    logSystemError('groq.triage_summary_error', 'Triage summary generation failed', error);
  }

  return ['Unable to generate summary - please review conversation'];
}

/**
 * Extract citations from AI response text
 * Citations are in the format [reference] or [their previous message], [their health profile]
 */
function extractCitations(content: string): string[] {
  const citationRegex = /\[([^\]]+)\]/g;
  const matches = content.match(citationRegex);
  
  if (!matches) return [];
  
  // Remove brackets and deduplicate
  return Array.from(new Set(matches.map(m => m.slice(1, -1))));
}

export default {
  generateResponse,
  generateTriageSummary,
};
