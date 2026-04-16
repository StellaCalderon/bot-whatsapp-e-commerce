const Database = require("./Database");
const { handleTicketIntent } = require("./TicketIntentResolver");
const { procesarEnvioMensajes } = require("./MessageSender");
const config = require("./config");

async function procesarBandejaOffline(client, companyConfig) {
    const companyId = companyConfig.id;
    try {
        const pendientes = await Database.obtenerMensajesCola(companyId);
        if (pendientes.length === 0) return;
        console.log(`(OFFLINE) Procesando ${pendientes.length} mensajes...`);
        const idsExitosos = [];
        for (const reg of pendientes) {
            try {
                const chat = await client.getChatById(reg.chatId);
                const responses = await handleTicketIntent(companyConfig, reg.chatId, reg.texto, false);
                if (responses && responses.length > 0) {
                    await procesarEnvioMensajes(client, chat, responses, Date.now());
                }
                idsExitosos.push(reg.id);
            } catch (e) {
                await Database.incrementarIntentoCola(reg.id);
                console.error(`(OFFLINE) Error en mensaje ${reg.id}:`, e.message);
            }
        }
        if (idsExitosos.length > 0) {
            await Database.eliminarMensajesCola(idsExitosos);
        }
    } catch (err) {
        console.error("(OFFLINE) Error crítico:", err.message);
    }
}

function iniciarWorkerOffline(client, companyConfig) {
    procesarBandejaOffline(client, companyConfig);
    setInterval(() => procesarBandejaOffline(client, companyConfig), 180000);
}

module.exports = { iniciarWorkerOffline };
