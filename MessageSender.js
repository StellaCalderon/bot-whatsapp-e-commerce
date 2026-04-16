const fs = require("fs");
const { MessageMedia } = require("whatsapp-web.js");
const StateManager = require("./StateManager");
const { esperarAsync } = require("./utils");
const config = require("./config");

async function procesarEnvioMensajes(client, chat, messages, msjLlegadaTimestamp) {
    if (!messages || messages.length === 0) return;

    const idReceptor = chat.id._serialized;
    StateManager.estadoBotEnviando[idReceptor] = true;

    try {
        for (let msg of messages) {
            try {
                if (typeof msg === "string") {
                    msg = { tipo: "texto", contenido: msg };
                }

                await esperarAsync(800 + Math.random() * 400);

                const ultimaAccionAgente = StateManager.ultimaAccionAgente[idReceptor] || 0;
                if (ultimaAccionAgente > msjLlegadaTimestamp) {
                    console.log(`(SENDER) Abortando envío: Intervención detectada en ${idReceptor}`);
                    return;
                }

                if (msg.tipo === "texto") {
                    const text = Array.isArray(msg.contenido)
                        ? msg.contenido[Math.floor(Math.random() * msg.contenido.length)]
                        : msg.contenido;

                    await chat.sendStateTyping();
                    const tiempoEscritura = Math.min(800 + (text.length * 30), config.TIMEOUT_MAX_ESCRITURA);
                    await esperarAsync(tiempoEscritura);

                    await client.sendMessage(idReceptor, text);
                    console.log(`(SENDER) Texto enviado a ${idReceptor}`);

                } else if (msg.tipo === "audio" || msg.tipo === "imagen") {
                    if (!fs.existsSync(msg.ruta)) {
                        console.error(`(SENDER) Fichero no encontrado: ${msg.ruta}`);
                        continue;
                    }

                    if (msg.tipo === "audio") {
                        await chat.sendStateRecording();
                        await esperarAsync(config.TIMEOUT_MAX_GRABACION);
                        const media = MessageMedia.fromFilePath(msg.ruta);
                        await client.sendMessage(idReceptor, media, { sendAudioAsVoice: true });
                    } else {
                        await chat.sendStateTyping();
                        await esperarAsync(1500);
                        const media = MessageMedia.fromFilePath(msg.ruta);
                        await client.sendMessage(idReceptor, media);
                    }
                    console.log(`(SENDER) ${msg.tipo.toUpperCase()} enviado a ${idReceptor}`);
                }
                await chat.clearState();
            } catch (error) {
                console.error(`(SENDER) Error en bloque de mensaje:`, error.message);
            }
        }
    } catch (error) {
        console.error(`(SENDER) Error crítico en cola de envío:`, error.message);
    } finally {
        StateManager.estadoBotEnviando[idReceptor] = false;
    }
}

module.exports = { procesarEnvioMensajes };
