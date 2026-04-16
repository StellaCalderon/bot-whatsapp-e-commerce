const { NlpManager } = require("node-nlp");
const axios = require("axios");
const fs = require("fs");
const config = require("./config");

const manager = new NlpManager({ languages: ["es", "en"], forceNER: true });
const cacheIA = new Map();

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

setInterval(() => {
    const ahora = Date.now();
    for (const [key, val] of cacheIA.entries()) {
        if (ahora > val.expiresAt) cacheIA.delete(key);
    }
}, config.INTERVALO_LIMPIEZA_CACHE_IA);

async function configurarEntrenamiento() {
    if (fs.existsSync(config.MODEL_PATH)) {
        await manager.load(config.MODEL_PATH);
        console.log("(IA) Modelo local cargado.");
    } else {
        await entrenarBasico();
    }
}

async function entrenarBasico() {
    const data = [
        ["es", "hola", "saludo"], ["es", "buenos días", "saludo"],
        ["es", "abrir ticket", "apertura_ticket"], ["es", "tengo un problema", "apertura_ticket"],
        ["es", "donde esta mi pedido", "estado_pedido"], ["es", "estado de mi paquete", "estado_pedido"],
        ["es", "como va mi ticket", "estado_ticket"], ["es", "ver estado ticket", "estado_ticket"],
        ["es", "hablar con un humano", "hablar_humano"], ["es", "agente", "hablar_humano"],
        ["es", "soporte tecnico", "categoria_tecnico"], ["es", "factura", "categoria_facturacion"],
        ["es", "mi cuenta", "categoria_cuenta"], ["es", "gracias", "gracias"],
        ["es", "adiós", "despedida"], ["es", "esto es una mierda", "insatisfaccion"],
        ["en", "hello", "saludo"], ["en", "i want to open a ticket", "apertura_ticket"],
        ["en", "order status", "estado_pedido"], ["en", "speak to a human", "hablar_humano"]
    ];

    data.forEach(d => manager.addDocument(d[0], d[1], d[2]));

    await manager.train();
    manager.save(config.MODEL_PATH);
    console.log("(IA) Entrenamiento básico completado.");
}

async function procesarIA(texto, chatId, isEnglish = false) {
    if (!texto) return { intent: "None", score: 0 };
    const txtOriginal = texto.trim();

    const cacheKey = `${chatId}_${txtOriginal}`;
    if (cacheIA.has(cacheKey)) {
        const cached = cacheIA.get(cacheKey);
        if (Date.now() < cached.expiresAt) return { intent: cached.intent, score: 1, ...cached.extraData };
    }

    const resultLocal = await manager.process(isEnglish ? "en" : "es", txtOriginal);
    if (resultLocal.score > config.UMBRAL_CONFIANZA_IA_LOCAL && resultLocal.intent !== "None") {
        return { intent: resultLocal.intent, score: resultLocal.score };
    }

    const systemPrompt = `Clasificador JSON para soporte e-commerce. Responde SOLO JSON: {"intent": "...", "categoria": "..."}
Intents: apertura_ticket, estado_ticket, estado_pedido, hablar_humano, categoria_tecnico, categoria_facturacion, categoria_cuenta, categoria_otro, gracias, saludo, despedida, insatisfaccion.
Si aplica, extrae: "descripcion", "email", "order_id" (formato ORD-XXXXXXXX).

Mensaje: "${txtOriginal.replace(/"/g, "'")}"`;

    const cloudResp = await callGemini(systemPrompt) || await callGroq({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: "Clasificador especializado" }, { role: "user", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.1
    });

    if (cloudResp) {
        try {
            const cleanedJson = cloudResp.replace(/```json|```/g, "").trim();
            const json = JSON.parse(cleanedJson);
            cacheIA.set(cacheKey, { intent: json.intent, extraData: json, expiresAt: Date.now() + config.EXPIRACION_CACHE_IA });
            return { intent: json.intent, score: 0.99, ...json };
        } catch (e) {
            console.error("(IA ERROR) Fallo parseando nube:", e.message, "Contenido:", cloudResp);
        }
    }

    return { intent: resultLocal.intent, score: resultLocal.score };
}

async function callGemini(prompt, retryCount = 0) {
    if (!process.env.GEMINI_API_KEY) return null;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY;

    try {
        const response = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }, { timeout: 15000 });
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        if (error.response?.status === 429 && retryCount < config.MAX_INTENTOS_COLA) {
            await wait(config.TIMEOUT_REINTENTO_API);
            return callGemini(prompt, retryCount + 1);
        }
        return null;
    }
}

async function callGroq(payload, retryCount = 0) {
    if (!process.env.GROQ_API_KEY) return null;
    const url = "https://api.groq.com/openai/v1/chat/completions";

    try {
        const response = await axios.post(url, payload, { headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" }, timeout: 15000 });
        return response.data?.choices?.[0]?.message?.content || null;
    } catch (error) {
        if (error.response?.status === 429 && retryCount < config.MAX_INTENTOS_COLA) {
            await wait(config.TIMEOUT_REINTENTO_API);
            return callGroq(payload, retryCount + 1);
        }
        return null;
    }
}

module.exports = { configurarEntrenamiento, procesarIA };