// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Define CORS headers so the browser can make requests to this edge function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Parse the request body (sent from battle.js)
    const { numQ, diff, source, model } = await req.json()
    
    // 3. Read the GROQ API key securely from Supabase Environment Variables
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is not configured in Supabase Secrets')
    }

    // 4. Construct the prompt
    const prompt = `You are a quiz generator. Generate exactly ${numQ} multiple-choice questions at ${diff} difficulty level.\n\n${source}\n\nIMPORTANT: Respond ONLY with a valid JSON array. No markdown, no code fences, no explanation.\nEach question object must have:\n- "question": the question text (string)\n- "options": an array of exactly 4 option strings\n- "correct": the correct answer string (must exactly match one of the options)\n\nExample format:\n[{"question":"What is 2+2?","options":["3","4","5","6"],"correct":"4"}]`;

    // 5. Call the Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    })

    const data = await response.json()

    // Handle Groq API errors
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 6. Clean and parse the response
    let text = data?.choices?.[0]?.message?.content || ''
    
    // Remove markdown code fences if present (e.g. ```json ... ```)
    text = text.replace(/```json\n?/ig, '').replace(/```\n?/g, '').trim();
    
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch(e) {
      console.error('Failed to parse Groq response:', text)
      return new Response(JSON.stringify({ error: 'AI returned invalid JSON format', raw: text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // 7. Return the structured JSON to the frontend
    return new Response(JSON.stringify({ questions: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    const err = error as Error
    console.error('Edge Function Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
