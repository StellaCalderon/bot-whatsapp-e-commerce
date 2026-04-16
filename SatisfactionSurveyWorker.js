const Database = require("./Database");
const { esperarAsync } = require("./utils");
const config = require("./config");

class SatisfactionSurveyWorker {
    static async iniciar(client, companyId) {
        console.log(`(SURVEY) Worker iniciado para ${companyId}.`);
        setInterval(async () => {
            try {
                const tickets = await Database.all(`
                    SELECT t.*, c.idioma 
                    FROM tickets t
                    JOIN clientes c ON t.cliente_chatId = c.chatId AND t.empresa_id = c.empresa_id
                    WHERE t.empresa_id = ? AND t.estado = 'cerrado' 
                    AND t.satisfaccion IS NULL
                    AND t.fecha_cierre >= datetime('now', '-48 hours')
                `, [companyId]);
                for (const ticket of tickets) {
                    const idioma = ticket.idioma || 'es';
                    const msg = idioma === 'en'
                        ? "How would you rate the service received? Please reply with a number from 1 to 5."
                        : "¿Cómo calificaría la atención recibida? Por favor, responda con un número del 1 al 5.";
                    try {
                        await client.sendMessage(ticket.cliente_chatId, msg);
                        console.log(`(SURVEY) Encuesta enviada para ticket #${ticket.id} (${idioma})`);
                        await esperarAsync(2000);
                    } catch (e) {
                        console.error(`(SURVEY) Error enviando a ${ticket.cliente_chatId}:`, e.message);
                    }
                }
            } catch (err) {
                console.error("(SURVEY ERROR):", err.message);
            }
        }, config.INTERVALO_ENCUESTA);
    }
}
module.exports = SatisfactionSurveyWorker;
