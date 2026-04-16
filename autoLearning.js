const Database = require('./Database');
const { validarAprendizajeIA } = require('./ia_bot');
const { normalizarTexto } = require('./utils');




const CONFIG = {
    ENABLED: false, // Desactivado por defecto
    MIN_LENGTH: 20,
    MAX_LENGTH: 500
};



async function ejecutarAutoLearning(ticketId, textoAgente) {
    if (!CONFIG.ENABLED) return;

    try {

        const tieneEmail = /\b[\w\.-]+@[\w\.-]+\.\w{2,4}\b/.test(textoAgente);
        const tieneEnvio = /ORD-\d{8}/i.test(textoAgente);
        const tieneRuta = /attachments|ticket_|\.jpg|\.png/i.test(textoAgente);

        if (tieneEmail || tieneEnvio || tieneRuta) {
            console.log(`(LEARNING) Respuesta en ticket #${ticketId} descartada por contener datos personales.`);
            return;
        }

        const ticket = await Database.obtenerTicket(ticketId);
        if (!ticket) return;

        if (textoAgente.length < CONFIG.MIN_LENGTH || textoAgente.length > CONFIG.MAX_LENGTH) return;
        if (textoAgente.startsWith('!')) return;

        const preguntaDelCliente = ticket.descripcion;



        const evaluacion = await validarAprendizajeIA(preguntaDelCliente, textoAgente);

        if (evaluacion.valido) {
            const respNorm = normalizarTexto(textoAgente);
            const existente = await Database.getCandidatoRespuesta(respNorm);

            if (existente) {
                const preguntas = JSON.parse(existente.preguntasAsociadas || "[]");
                if (!preguntas.includes(preguntaDelCliente)) {
                    preguntas.push(preguntaDelCliente);
                    await Database.actualizarCandidato(existente.veces + 1, JSON.stringify(preguntas), respNorm);
                }
            } else {
                await Database.addNuevoCandidato(respNorm, textoAgente, JSON.stringify([preguntaDelCliente]));
            }
            console.log(`(LEARNING) Nueva FAQ candidata detectada para ticket #${ticketId}`);
        }
    } catch (e) {
        console.error("(LEARNING) Error:", e.message);
    }
}

module.exports = { ejecutarAutoLearning, CONFIG };
